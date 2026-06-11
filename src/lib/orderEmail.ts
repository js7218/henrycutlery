import nodemailer from 'nodemailer';
import { formatPrice } from '@/lib/utils';

type OrderEmailItem = {
  productName: string;
  price: number;
  quantity: number;
};

type OrderEmailAddress = {
  name: string;
  phone: string;
  province?: string;
  city?: string;
  district?: string;
  detail: string;
};

type OrderEmailPayload = {
  orderNumber: string;
  items: OrderEmailItem[];
  totalAmount: number;
  paymentMethod: string;
  shippingAddress: OrderEmailAddress;
  createdAt: string;
};

const ORDER_RECEIVER_EMAIL = 'rjyy_88@qq.com';

const HSBC_ACCOUNT = {
  accountName: 'HongKong Henry Cutlery Co.Ltd.',
  accountNumber: '147-6411161-838',
  bankName: 'The Hongkong and Shanghai Banking Corporation Limited',
  bankAddress: "1 Queen's Road Central, Hong Kong.",
};

function paymentLabel(method: string) {
  switch (method) {
    case 'bank_transfer':
      return 'HSBC Bank Transfer';
    case 'wechat':
      return 'WeChat Pay';
    case 'alipay':
      return 'Alipay';
    case 'card':
      return 'Bank Card';
    default:
      return method;
  }
}

function smtpReady() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

function buildOrderEmail(order: OrderEmailPayload) {
  const itemRows = order.items.map((item, index) => {
    const lineTotal = item.price * item.quantity;
    return `
      <tr>
        <td style="padding:8px;border-bottom:1px solid #eee;">${index + 1}</td>
        <td style="padding:8px;border-bottom:1px solid #eee;">${item.productName.toUpperCase()}</td>
        <td style="padding:8px;border-bottom:1px solid #eee;">${item.quantity}</td>
        <td style="padding:8px;border-bottom:1px solid #eee;">${formatPrice(item.price)}</td>
        <td style="padding:8px;border-bottom:1px solid #eee;">${formatPrice(lineTotal)}</td>
      </tr>
    `;
  }).join('');

  const text = [
    'New Adam Cutlery order submitted.',
    '',
    `Order Number: ${order.orderNumber}`,
    `Payment Method: ${paymentLabel(order.paymentMethod)}`,
    `Total Amount: ${formatPrice(order.totalAmount)}`,
    `Created At: ${order.createdAt}`,
    '',
    'HSBC Payment Account:',
    HSBC_ACCOUNT.accountName,
    `Account: ${HSBC_ACCOUNT.accountNumber}`,
    `Bank: ${HSBC_ACCOUNT.bankName}`,
    `Bank address: ${HSBC_ACCOUNT.bankAddress}`,
    '',
    'Shipping Address:',
    `Name: ${order.shippingAddress.name}`,
    `Phone: ${order.shippingAddress.phone}`,
    `Address: ${order.shippingAddress.province || ''} ${order.shippingAddress.city || ''} ${order.shippingAddress.district || ''} ${order.shippingAddress.detail}`,
    '',
    'Items:',
    ...order.items.map((item, index) => `${index + 1}. ${item.productName.toUpperCase()} | Qty: ${item.quantity} | Unit: ${formatPrice(item.price)} | Total: ${formatPrice(item.price * item.quantity)}`),
  ].join('\n');

  const html = `
    <div style="font-family:Arial,sans-serif;color:#222;line-height:1.5;">
      <h2 style="margin:0 0 12px;">New Adam Cutlery Order</h2>
      <p><strong>Order Number:</strong> ${order.orderNumber}</p>
      <p><strong>Payment Method:</strong> ${paymentLabel(order.paymentMethod)}</p>
      <p><strong>Total Amount:</strong> ${formatPrice(order.totalAmount)}</p>
      <p><strong>Created At:</strong> ${order.createdAt}</p>

      <h3 style="margin-top:24px;">HSBC Payment Account</h3>
      <p><strong>Payment account:</strong> ${HSBC_ACCOUNT.accountName}</p>
      <p><strong>Account:</strong> ${HSBC_ACCOUNT.accountNumber}</p>
      <p><strong>Bank:</strong> ${HSBC_ACCOUNT.bankName}</p>
      <p><strong>Bank address:</strong> ${HSBC_ACCOUNT.bankAddress}</p>

      <h3 style="margin-top:24px;">Shipping Address</h3>
      <p><strong>Name:</strong> ${order.shippingAddress.name}</p>
      <p><strong>Phone:</strong> ${order.shippingAddress.phone}</p>
      <p><strong>Address:</strong> ${order.shippingAddress.province || ''} ${order.shippingAddress.city || ''} ${order.shippingAddress.district || ''} ${order.shippingAddress.detail}</p>

      <h3 style="margin-top:24px;">Items</h3>
      <table style="border-collapse:collapse;width:100%;font-size:14px;">
        <thead>
          <tr>
            <th align="left" style="padding:8px;border-bottom:2px solid #ddd;">#</th>
            <th align="left" style="padding:8px;border-bottom:2px solid #ddd;">Product</th>
            <th align="left" style="padding:8px;border-bottom:2px solid #ddd;">Qty</th>
            <th align="left" style="padding:8px;border-bottom:2px solid #ddd;">Unit</th>
            <th align="left" style="padding:8px;border-bottom:2px solid #ddd;">Total</th>
          </tr>
        </thead>
        <tbody>${itemRows}</tbody>
      </table>
    </div>
  `;

  return { text, html };
}

export async function sendOrderNotificationEmail(order: OrderEmailPayload) {
  if (!smtpReady()) {
    return { sent: false, skipped: true, reason: 'SMTP_NOT_CONFIGURED' };
  }

  const port = Number(process.env.SMTP_PORT || '587');
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  const { text, html } = buildOrderEmail(order);
  await transporter.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to: ORDER_RECEIVER_EMAIL,
    subject: `Adam Cutlery Order ${order.orderNumber}`,
    text,
    html,
  });

  return { sent: true, skipped: false };
}
