import twilio from 'twilio';

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const fromPhone = process.env.TWILIO_PHONE_NUMBER;

let client: twilio.Twilio | null = null;

function getClient(): twilio.Twilio | null {
  if (!accountSid || !authToken || !fromPhone) {
    return null;
  }
  if (!client) {
    client = twilio(accountSid, authToken);
  }
  return client;
}

export async function sendSMS(to: string, body: string): Promise<{ success: boolean; error?: string }> {
  const twilioClient = getClient();
  if (!twilioClient) {
    return { success: false, error: 'SMS service not configured' };
  }

  try {
    await twilioClient.messages.create({
      body,
      from: fromPhone,
      to,
    });
    return { success: true };
  } catch (err) {
    console.error('[SMS] Failed to send:', err);
    return { success: false, error: 'Failed to send SMS' };
  }
}
