import { getMongoClient, MONGODB_DB_NAME } from '../config/database.js';
import crypto from 'crypto';

// Verify webhook signature
const verifyWebhookSignature = (payload, signature, secret) => {
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');
  
  return crypto.timingSafeEqual(
    Buffer.from(signature.replace('whsec_', ''), 'hex'),
    Buffer.from(expectedSignature, 'hex')
  );
};

// Handle Clerk webhook events
export async function handleClerkWebhook(req, res) {
  try {
    const signature = req.headers['svix-signature'];
    const timestamp = req.headers['svix-timestamp'];
    const id = req.headers['svix-id'];
    
    if (!signature || !timestamp || !id) {
      return res.status(400).json({ 
        error: 'Missing webhook headers', 
        message: 'svix-signature, svix-timestamp, and svix-id are required' 
      });
    }

    const payload = JSON.stringify(req.body);
    const secret = process.env.CLERK_WEBHOOK_SECRET;
    
    if (!secret) {
      console.error('[Clerk-Webhook] CLERK_WEBHOOK_SECRET not configured');
      return res.status(500).json({ 
        error: 'Webhook secret not configured' 
      });
    }

    // Verify webhook signature
    if (!verifyWebhookSignature(payload, signature, secret)) {
      console.error('[Clerk-Webhook] Invalid signature');
      return res.status(401).json({ 
        error: 'Invalid webhook signature' 
      });
    }

    const { type, data } = req.body;
    console.log(`[Clerk-Webhook] Received event: ${type}`);

    const mongoClient = await getMongoClient();
    const db = mongoClient.db(MONGODB_DB_NAME);
    const usersCollection = db.collection('users');

    switch (type) {
      case 'user.created':
        await handleUserCreated(data, usersCollection);
        break;
      
      case 'user.updated':
        await handleUserUpdated(data, usersCollection);
        break;
      
      case 'user.deleted':
        await handleUserDeleted(data, usersCollection);
        break;
      
      default:
        console.log(`[Clerk-Webhook] Unhandled event type: ${type}`);
    }

    res.json({ success: true, message: 'Webhook processed successfully' });
  } catch (error) {
    console.error('[Clerk-Webhook] Error:', error);
    res.status(500).json({ 
      error: 'Failed to process webhook', 
      message: error.message 
    });
  }
}

// Handle user.created event
async function handleUserCreated(data, usersCollection) {
  const { id, email_addresses, first_name, last_name, image_url, created_at } = data;
  
  const userData = {
    clerk_id: id,
    email: email_addresses?.[0]?.email_address || '',
    first_name: first_name || '',
    last_name: last_name || '',
    full_name: `${first_name || ''} ${last_name || ''}`.trim(),
    image_url: image_url || '',
    created_at: new Date(created_at * 1000).toISOString(),
    last_login: new Date().toISOString(),
    subscription_tier: 'free',
    settings: {
      default_database: null,
      theme: 'light',
      language: 'en'
    }
  };

  await usersCollection.insertOne(userData);
  console.log(`[Clerk-Webhook] User created: ${id}`);
}

// Handle user.updated event
async function handleUserUpdated(data, usersCollection) {
  const { id, email_addresses, first_name, last_name, image_url, updated_at } = data;
  
  const updateData = {
    email: email_addresses?.[0]?.email_address || '',
    first_name: first_name || '',
    last_name: last_name || '',
    full_name: `${first_name || ''} ${last_name || ''}`.trim(),
    image_url: image_url || '',
    updated_at: new Date(updated_at * 1000).toISOString()
  };

  await usersCollection.updateOne(
    { clerk_id: id },
    { $set: updateData }
  );
  console.log(`[Clerk-Webhook] User updated: ${id}`);
}

// Handle user.deleted event
async function handleUserDeleted(data, usersCollection) {
  const { id } = data;
  
  await usersCollection.deleteOne({ clerk_id: id });
  console.log(`[Clerk-Webhook] User deleted: ${id}`);
} 