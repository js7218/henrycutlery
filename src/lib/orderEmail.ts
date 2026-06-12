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

function getOrderReceiverEmail() {
  return process.env.ORDER_RECEIVER_EMAIL || '';
}

function getPrivateBankDetails() {
  return {
    accountName: process.env.BANK_ACCOUNT_NAME || '',
    accountNumber: process.env.BANK_ACCOUNT_NUMBER || '',
    bankName: process.env.BANK_NAME || '',
    bankAddress: process.env.BANK_ADDRESS || '',
  };
}

function escapeHtml(value: unknown) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

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
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS && getOrderReceiverEmail());
}

function buildOrderEmail(order: OrderEmailPayload) {
  const itemRows = order.items.map((item, index) => {
    const lineTotal = item.price * item.quantity;
    return `
      <tr>
        <td style="padding:8px;border-bottom:1px solid #eee;">${index + 1}</td>
        <td style="padding:8px;border-bottom:1px solid #eee;">${escapeHtml(item.productName.toUpperCase())}</td>
        <td style="padding:8px;border-bottom:1px solid #eee;">${item.quantity}</td>
        <td style="padding:8px;border-bottom:1px solid #eee;">${formatPrice(item.price)}</td>
        <td style="padding:8px;border-bottom:1px solid #eee;">${formatPrice(lineTotal)}</td>
      </tr>
    `;
  }).join('');
  const bankDetails = getPrivateBankDetails();
  const hasBankDetails = Boolean(bankDetails.accountName || bankDetails.accountNumber || bankDetails.bankName || bankDetails.bankAddress);
  const textBankLines = hasBankDetails
    ? [
        'Private Payment Account:',
        bankDetails.accountName,
        bankDetails.accountNumber ? `Account: ${bankDetails.accountNumber}` : '',
        bankDetails.bankName ? `Bank: ${bankDetails.bankName}` : '',
        bankDetails.bankAddress ? `Bank address: ${bankDetails.bankAddress}` : '',
        '',
      ].filter(Boolean)
    : [];
  const htmlBankBlock = hasBankDetails
    ? `
      <h3 style="margin-top:24px;">Private Payment Account</h3>
      ${bankDetails.accountName ? `<p><strong>Payment account:</strong> ${escapeHtml(bankDetails.accountName)}</p>` : ''}
      ${bankDetails.accountNumber ? `<p><strong>Account:</strong> ${escapeHtml(bankDetails.accountNumber)}</p>` : ''}
      ${bankDetails.bankName ? `<p><strong>Bank:</strong> ${escapeHtml(bankDetails.bankName)}</p>` : ''}
      ${bankDetails.bankAddress ? `<p><strong>Bank address:</strong> ${escapeHtml(bankDetails.bankAddress)}</p>` : ''}
    `
    : '';

  const text = [
    'New Adam Cutlery order submitted.',
    '',
    `Order Number: ${order.orderNumber}`,
    `Payment Method: ${paymentLabel(order.paymentMethod)}`,
    `Total Amount: ${formatPrice(order.totalAmount)}`,
    `Created At: ${order.createdAt}`,
    '',
    ...textBankLines,
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
      <p><strong>Order Number:</strong> ${escapeHtml(order.orderNumber)}</p>
      <p><strong>Payment Method:</strong> ${escapeHtml(paymentLabel(order.paymentMethod))}</p>
      <p><strong>Total Amount:</strong> ${formatPrice(order.totalAmount)}</p>
      <p><strong>Created At:</strong> ${escapeHtml(order.createdAt)}</p>

      ${htmlBankBlock}

      <h3 style="margin-top:24px;">Shipping Address</h3>
      <p><strong>Name:</strong> ${escapeHtml(order.shippingAddress.name)}</p>
      <p><strong>Phone:</strong> ${escapeHtml(order.shippingAddress.phone)}</p>
      <p><strong>Address:</strong> ${escapeHtml(`${order.shippingAddress.province || ''} ${order.shippingAddress.city || ''} ${order.shippingAddress.district || ''} ${order.shippingAddress.detail}`)}</p>

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
    to: getOrderReceiverEmail(),
    subject: `Adam Cutlery Order ${order.orderNumber}`,
    text,
    html,
  });

  return { sent: true, skipped: false };
}

/**
 * Send a generic transactional email (e.g. password reset link). Uses the
 * same SMTP credentials as order notifications, so a single configured
 * mailer powers the whole site.
 */
export async function sendTransactionalEmail(payload: {
  to: string;
  subject: string;
  html: string;
  text?: string;
}): Promise<{ sent: boolean; skipped: boolean; reason?: string }> {
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
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

  await transporter.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to: payload.to,
    subject: payload.subject,
    text: payload.text,
    html: payload.html,
  });
  return { sent: true, skipped: false };
}
