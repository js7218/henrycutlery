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
  shippingFee?: number;
  shippingQuoted?: boolean;
};

type OrderEmailPayload = {
  orderNumber: string;
  items: OrderEmailItem[];
  totalAmount: number;
  paymentMethod: string;
  shippingAddress: OrderEmailAddress;
  createdAt: string;
  /** Estimated shipping included in totalAmount, when it could be calculated. */
  shippingFee?: number;
  /** True when shipping is quoted manually (no SKU weights / destination rate). */
  shippingQuoted?: boolean;
};

function getOrderReceiverEmail() {
  // Default to owner's email; env var can override for testing
  return process.env.ORDER_RECEIVER_EMAIL || process.env.BUSINESS_EMAIL || 'info@adamcutlery.com';
}

/**
 * Recipients for internal admin alerts (new inquiries, daily summaries).
 * ADMIN_NOTIFY_EMAIL may contain a comma-separated list.
 */
export function getAdminNotifyEmails() {
  return process.env.ADMIN_NOTIFY_EMAIL || getOrderReceiverEmail();
}

function getPrivateBankDetails() {
  // Fall back to the same NEXT_PUBLIC_ values the checkout page shows, so the
  // email never contradicts what the customer saw on screen.
  return {
    accountName:
      process.env.BANK_ACCOUNT_NAME || process.env.NEXT_PUBLIC_BANK_ACCOUNT_NAME || 'Adam Cutlery',
    accountNumber:
      process.env.BANK_ACCOUNT_NUMBER || process.env.NEXT_PUBLIC_BANK_ACCOUNT_NUMBER || '',
    bankName: process.env.BANK_NAME || process.env.NEXT_PUBLIC_BANK_NAME || 'HSBC',
    bankAddress: process.env.BANK_ADDRESS || process.env.NEXT_PUBLIC_BANK_ADDRESS || '',
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

/**
 * How to label the money figure in an email: when freight still has to be
 * quoted, the number is only the goods total and the customer must be told.
 */
function shippingSummary(order: OrderEmailPayload) {
  const quoted = order.shippingQuoted ?? order.shippingAddress.shippingQuoted;
  const fee = order.shippingFee ?? order.shippingAddress.shippingFee;
  if (quoted) {
    return {
      label: 'Goods Total (excl. shipping)',
      note: 'Shipping: quoted separately by destination and weight. We will confirm it before you pay.',
    };
  }
  if (typeof fee === 'number' && fee > 0) {
    return { label: 'Order Total', note: `Estimated shipping: ${formatPrice(fee)}` };
  }
  return { label: 'Order Total', note: '' };
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
 * Send the customer an immediate "order received, awaiting payment" email.
 * Without this the customer only sees the payment instructions once on the
 * checkout screen and never hears from us again until payment is confirmed.
 */
export async function sendCustomerOrderReceivedEmail(
  customerEmail: string,
  order: OrderEmailPayload
): Promise<{ sent: boolean; skipped: boolean; reason?: string }> {
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

  const reference = order.orderNumber.slice(-8).toUpperCase();
  const bank = getPrivateBankDetails();
  const isWechat = order.paymentMethod === 'wechat';
  // Be explicit about shipping so the customer never assumes the goods total
  // is the final amount when the freight still has to be quoted.
  const { label: totalLabel, note: shippingNote } = shippingSummary(order);

  const paymentLines = isWechat
    ? [
        'Payment method: WeChat Pay',
        'Open the order in your account, scan the WeChat payment code and send us the receipt.',
      ]
    : [
        'Payment method: HSBC bank transfer',
        bank.accountName ? `Account name: ${bank.accountName}` : '',
        bank.accountNumber ? `Account number: ${bank.accountNumber}` : '',
        bank.bankName ? `Bank: ${bank.bankName}` : '',
        bank.bankAddress ? `Bank address: ${bank.bankAddress}` : '',
        `Please use "${reference}" as the payment reference.`,
      ].filter(Boolean);

  const text = [
    'Thank you for your order from Adam Cutlery.',
    '',
    'Your order has been received and is awaiting payment.',
    `Payment Reference: ${reference}`,
    `${totalLabel}: ${formatPrice(order.totalAmount)}`,
    ...(shippingNote ? [shippingNote] : []),
    `Created At: ${order.createdAt}`,
    '',
    ...paymentLines,
    '',
    'Your order number will be confirmed once we receive your payment.',
    '',
    'Shipping Address:',
    `Name: ${order.shippingAddress.name}`,
    `Phone: ${order.shippingAddress.phone}`,
    `Address: ${order.shippingAddress.province || ''} ${order.shippingAddress.city || ''} ${order.shippingAddress.district || ''} ${order.shippingAddress.detail}`,
    '',
    'Items:',
    ...order.items.map((item, index) => `${index + 1}. ${item.productName.toUpperCase()} | Qty: ${item.quantity} | Unit: ${formatPrice(item.price)} | Total: ${formatPrice(item.price * item.quantity)}`),
    '',
    'Best regards,',
    'Adam Cutlery',
  ].join('\n');

  const paymentHtml = isWechat
    ? `<p><strong>Payment method:</strong> WeChat Pay</p>
       <p>Open the order in your account, scan the WeChat payment code and send us the receipt.</p>`
    : `<p><strong>Payment method:</strong> HSBC bank transfer</p>
       <p>${bank.accountName ? `<strong>Account name:</strong> ${escapeHtml(bank.accountName)}<br/>` : ''}
       ${bank.accountNumber ? `<strong>Account number:</strong> ${escapeHtml(bank.accountNumber)}<br/>` : ''}
       ${bank.bankName ? `<strong>Bank:</strong> ${escapeHtml(bank.bankName)}<br/>` : ''}
       ${bank.bankAddress ? `<strong>Bank address:</strong> ${escapeHtml(bank.bankAddress)}<br/>` : ''}
       <strong>Payment reference:</strong> ${escapeHtml(reference)}</p>`;

  const html = `
    <div style="font-family:Arial,sans-serif;color:#222;line-height:1.5;">
      <h2 style="margin:0 0 12px;">We received your order</h2>
      <p>Dear ${escapeHtml(order.shippingAddress.name)},</p>
      <p>Your order is awaiting payment. Please complete the payment using the details below.</p>

      <p><strong>Payment Reference:</strong> ${escapeHtml(reference)}</p>
      <p><strong>${escapeHtml(totalLabel)}:</strong> ${formatPrice(order.totalAmount)}</p>
      ${shippingNote ? `<p>${escapeHtml(shippingNote)}</p>` : ''}
      ${paymentHtml}
      <p>Your order number will be confirmed once we receive your payment.</p>

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
        <tbody>
          ${order.items.map((item, index) => `
            <tr>
              <td style="padding:8px;border-bottom:1px solid #eee;">${index + 1}</td>
              <td style="padding:8px;border-bottom:1px solid #eee;">${escapeHtml(item.productName.toUpperCase())}</td>
              <td style="padding:8px;border-bottom:1px solid #eee;">${item.quantity}</td>
              <td style="padding:8px;border-bottom:1px solid #eee;">${formatPrice(item.price)}</td>
              <td style="padding:8px;border-bottom:1px solid #eee;">${formatPrice(item.price * item.quantity)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>

      <p style="margin-top:24px;">Best regards,<br/>Adam Cutlery</p>
    </div>
  `;

  await transporter.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to: customerEmail,
    subject: `Order Received - ${reference} | Adam Cutlery`,
    text,
    html,
  });

  return { sent: true, skipped: false };
}

/**
 * Send a customer order confirmation email.
 * Called after payment is confirmed so the customer receives a receipt.
 */
export async function sendCustomerOrderConfirmation(
  customerEmail: string,
  order: OrderEmailPayload
): Promise<{ sent: boolean; skipped: boolean; reason?: string }> {
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

  const { label: totalLabel, note: shippingNote } = shippingSummary(order);

  const text = [
    'Thank you for your order from Adam Cutlery!',
    '',
    `Order Number: ${order.orderNumber}`,
    `Payment Method: ${paymentLabel(order.paymentMethod)}`,
    `${totalLabel}: ${formatPrice(order.totalAmount)}`,
    ...(shippingNote ? [shippingNote] : []),
    `Created At: ${order.createdAt}`,
    '',
    'Shipping Address:',
    `Name: ${order.shippingAddress.name}`,
    `Phone: ${order.shippingAddress.phone}`,
    `Address: ${order.shippingAddress.province || ''} ${order.shippingAddress.city || ''} ${order.shippingAddress.district || ''} ${order.shippingAddress.detail}`,
    '',
    'Items:',
    ...order.items.map((item, index) => `${index + 1}. ${item.productName.toUpperCase()} | Qty: ${item.quantity} | Unit: ${formatPrice(item.price)} | Total: ${formatPrice(item.price * item.quantity)}`),
    '',
    'We will notify you once your order has been shipped.',
    '',
    'Best regards,',
    'Adam Cutlery',
  ].join('\n');

  const html = `
    <div style="font-family:Arial,sans-serif;color:#222;line-height:1.5;">
      <h2 style="margin:0 0 12px;">Thank You for Your Order!</h2>
      <p>Dear ${escapeHtml(order.shippingAddress.name)},</p>
      <p>We have received and confirmed your payment. Here are your order details:</p>

      <p><strong>Order Number:</strong> ${escapeHtml(order.orderNumber)}</p>
      <p><strong>Payment Method:</strong> ${escapeHtml(paymentLabel(order.paymentMethod))}</p>
      <p><strong>Total Amount:</strong> ${formatPrice(order.totalAmount)}</p>
      ${shippingNote ? `<p>${escapeHtml(shippingNote)}</p>` : ''}
      <p><strong>Created At:</strong> ${escapeHtml(order.createdAt)}</p>

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

      <p style="margin-top:24px;">We will notify you once your order has been shipped.</p>
      <p>Best regards,<br/>Adam Cutlery</p>
    </div>
  `;

  await transporter.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to: customerEmail,
    subject: `Order Confirmed - ${order.orderNumber} | Adam Cutlery`,
    text,
    html,
  });

  return { sent: true, skipped: false };
}

/**
 * Tell the customer their order has shipped, including the tracking number.
 * Without this they have to keep refreshing the account page to find out.
 */
export async function sendCustomerShippedEmail(
  customerEmail: string,
  order: OrderEmailPayload,
  trackingNumber: string
): Promise<{ sent: boolean; skipped: boolean; reason?: string }> {
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

  const trackingLine = trackingNumber
    ? `Tracking number: ${trackingNumber}`
    : 'A tracking number will follow shortly.';

  const text = [
    'Your order has shipped.',
    '',
    `Order Number: ${order.orderNumber}`,
    trackingLine,
    '',
    'Shipping Address:',
    `Name: ${order.shippingAddress.name}`,
    `Phone: ${order.shippingAddress.phone}`,
    `Address: ${order.shippingAddress.province || ''} ${order.shippingAddress.city || ''} ${order.shippingAddress.district || ''} ${order.shippingAddress.detail}`,
    '',
    'Best regards,',
    'Adam Cutlery',
  ].join('\n');

  const html = `
    <div style="font-family:Arial,sans-serif;color:#222;line-height:1.5;">
      <h2 style="margin:0 0 12px;">Your order has shipped</h2>
      <p>Dear ${escapeHtml(order.shippingAddress.name)},</p>
      <p>Good news — your order has left our workshop.</p>
      <p><strong>Order Number:</strong> ${escapeHtml(order.orderNumber)}</p>
      <p><strong>${trackingNumber ? 'Tracking Number' : 'Tracking'}:</strong> ${escapeHtml(trackingLine)}</p>

      <h3 style="margin-top:24px;">Shipping Address</h3>
      <p><strong>Name:</strong> ${escapeHtml(order.shippingAddress.name)}</p>
      <p><strong>Phone:</strong> ${escapeHtml(order.shippingAddress.phone)}</p>
      <p><strong>Address:</strong> ${escapeHtml(`${order.shippingAddress.province || ''} ${order.shippingAddress.city || ''} ${order.shippingAddress.district || ''} ${order.shippingAddress.detail}`)}</p>

      <p style="margin-top:24px;">Best regards,<br/>Adam Cutlery</p>
    </div>
  `;

  await transporter.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to: customerEmail,
    subject: `Order Shipped - ${order.orderNumber} | Adam Cutlery`,
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

type InquiryEmailPayload = {
  id: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  company?: string;
  items: OrderEmailItem[];
  totalAmount: number;
  expectedDelivery?: string;
  customization?: string;
  notes?: string;
  reason?: string;
  createdAt: string;
};

const reasonLabels: Record<string, string> = {
  order_value: 'Order value >= $10,000',
  bulk_quantity: 'Single product quantity >= 1,300 units',
  insufficient_stock: 'Quantity exceeds current stock',
};

/**
 * Notify the owner immediately when a bulk-order inquiry is submitted.
 */
export async function sendInquiryNotificationEmail(inquiry: InquiryEmailPayload) {
  const itemRows = inquiry.items.map((item, index) => `
    <tr>
      <td style="padding:8px;border-bottom:1px solid #eee;">${index + 1}</td>
      <td style="padding:8px;border-bottom:1px solid #eee;">${escapeHtml(item.productName.toUpperCase())}</td>
      <td style="padding:8px;border-bottom:1px solid #eee;">${item.quantity}</td>
      <td style="padding:8px;border-bottom:1px solid #eee;">${formatPrice(item.price)}</td>
      <td style="padding:8px;border-bottom:1px solid #eee;">${formatPrice(item.price * item.quantity)}</td>
    </tr>
  `).join('');

  const reasons = (inquiry.reason || '')
    .split(',')
    .map((reason) => reason.trim())
    .filter(Boolean)
    .map((reason) => reasonLabels[reason] || reason);

  const text = [
    'New Adam Cutlery bulk order inquiry.',
    '',
    `Inquiry ID: ${inquiry.id}`,
    `Created At: ${inquiry.createdAt}`,
    reasons.length ? `Reason: ${reasons.join('; ')}` : '',
    '',
    `Contact: ${inquiry.contactName}`,
    `Email: ${inquiry.contactEmail}`,
    `Phone: ${inquiry.contactPhone}`,
    inquiry.company ? `Company: ${inquiry.company}` : '',
    '',
    `Reference Total: ${formatPrice(inquiry.totalAmount)}`,
    inquiry.expectedDelivery ? `Expected Delivery: ${inquiry.expectedDelivery}` : '',
    inquiry.customization ? `Customization: ${inquiry.customization}` : '',
    inquiry.notes ? `Notes: ${inquiry.notes}` : '',
    '',
    'Items:',
    ...inquiry.items.map((item, index) => `${index + 1}. ${item.productName.toUpperCase()} | Qty: ${item.quantity} | Unit: ${formatPrice(item.price)} | Total: ${formatPrice(item.price * item.quantity)}`),
  ].filter((line) => line !== '').join('\n');

  const html = `
    <div style="font-family:Arial,sans-serif;color:#222;line-height:1.5;">
      <h2 style="margin:0 0 12px;">New Bulk Order Inquiry</h2>
      <p><strong>Inquiry ID:</strong> ${escapeHtml(inquiry.id)}</p>
      <p><strong>Created At:</strong> ${escapeHtml(inquiry.createdAt)}</p>
      ${reasons.length ? `<p><strong>Reason:</strong> ${escapeHtml(reasons.join('; '))}</p>` : ''}

      <h3 style="margin-top:20px;">Contact</h3>
      <p><strong>Name:</strong> ${escapeHtml(inquiry.contactName)}</p>
      <p><strong>Email:</strong> ${escapeHtml(inquiry.contactEmail)}</p>
      <p><strong>Phone:</strong> ${escapeHtml(inquiry.contactPhone)}</p>
      ${inquiry.company ? `<p><strong>Company:</strong> ${escapeHtml(inquiry.company)}</p>` : ''}

      <h3 style="margin-top:20px;">Request</h3>
      <p><strong>Reference Total:</strong> ${formatPrice(inquiry.totalAmount)}</p>
      ${inquiry.expectedDelivery ? `<p><strong>Expected Delivery:</strong> ${escapeHtml(inquiry.expectedDelivery)}</p>` : ''}
      ${inquiry.customization ? `<p><strong>Customization:</strong> ${escapeHtml(inquiry.customization)}</p>` : ''}
      ${inquiry.notes ? `<p><strong>Notes:</strong> ${escapeHtml(inquiry.notes)}</p>` : ''}

      <h3 style="margin-top:20px;">Items</h3>
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

  return sendTransactionalEmail({
    to: getAdminNotifyEmails(),
    subject: `New Bulk Inquiry - ${inquiry.contactName} | Adam Cutlery`,
    text,
    html,
  });
}
