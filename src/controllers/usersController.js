import { getMongoClient, MONGODB_DB_NAME } from '../config/database.js';

// Create or update user
export async function createOrUpdateUser(req, res) {
  try {
    const { clerk_id, email, first_name, last_name, full_name, image_url, subscription_tier, settings } = req.body;
    
    if (!clerk_id || !email) {
      return res.status(400).json({ 
        error: 'Missing required fields', 
        message: 'clerk_id and email are required' 
      });
    }

    const mongoClient = await getMongoClient();
    const db = mongoClient.db(MONGODB_DB_NAME);
    const usersCollection = db.collection('users');

    // Check if user already exists
    const existingUser = await usersCollection.findOne({ clerk_id });

    if (existingUser) {
      // Update existing user
      const updateData = {
        email,
        first_name,
        last_name,
        full_name,
        image_url,
        last_login: new Date().toISOString(),
        ...(subscription_tier && { subscription_tier }),
        ...(settings && { settings })
      };

      const result = await usersCollection.updateOne(
        { clerk_id },
        { $set: updateData }
      );

      if (result.modifiedCount > 0) {
        res.json({ 
          success: true, 
          message: 'User updated successfully',
          user_id: existingUser._id
        });
      } else {
        res.json({ 
          success: true, 
          message: 'User already up to date',
          user_id: existingUser._id
        });
      }
    } else {
      // Create new user
      const userData = {
        clerk_id,
        email,
        first_name: first_name || '',
        last_name: last_name || '',
        full_name: full_name || '',
        image_url: image_url || '',
        created_at: new Date().toISOString(),
        last_login: new Date().toISOString(),
        subscription_tier: subscription_tier || 'free',
        settings: settings || {
          default_database: null,
          theme: 'light',
          language: 'en'
        }
      };

      const result = await usersCollection.insertOne(userData);
      
      res.status(201).json({ 
        success: true, 
        message: 'User created successfully',
        user_id: result.insertedId
      });
    }
  } catch (error) {
    console.error('[Users-Controller] Error:', error);
    res.status(500).json({ 
      error: 'Failed to create/update user', 
      message: error.message 
    });
  }
}

// Get user by clerk_id
export async function getUserByClerkId(req, res) {
  try {
    const { clerk_id } = req.params;
    
    if (!clerk_id) {
      return res.status(400).json({ 
        error: 'Missing clerk_id', 
        message: 'clerk_id is required' 
      });
    }

    const mongoClient = await getMongoClient();
    const db = mongoClient.db(MONGODB_DB_NAME);
    const usersCollection = db.collection('users');

    const user = await usersCollection.findOne({ clerk_id });
    
    if (!user) {
      return res.status(404).json({ 
        error: 'User not found', 
        message: 'User with this clerk_id does not exist' 
      });
    }

    res.json({ 
      success: true, 
      user: {
        id: user._id,
        clerk_id: user.clerk_id,
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name,
        full_name: user.full_name,
        image_url: user.image_url,
        created_at: user.created_at,
        last_login: user.last_login,
        subscription_tier: user.subscription_tier,
        settings: user.settings
      }
    });
  } catch (error) {
    console.error('[Users-Controller] Error:', error);
    res.status(500).json({ 
      error: 'Failed to get user', 
      message: error.message 
    });
  }
}

// Update user settings
export async function updateUserSettings(req, res) {
  try {
    const { clerk_id } = req.params;
    const { settings } = req.body;
    
    if (!clerk_id) {
      return res.status(400).json({ 
        error: 'Missing clerk_id', 
        message: 'clerk_id is required' 
      });
    }

    if (!settings) {
      return res.status(400).json({ 
        error: 'Missing settings', 
        message: 'settings object is required' 
      });
    }

    const mongoClient = await getMongoClient();
    const db = mongoClient.db(MONGODB_DB_NAME);
    const usersCollection = db.collection('users');

    const result = await usersCollection.updateOne(
      { clerk_id },
      { $set: { settings, updated_at: new Date().toISOString() } }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ 
        error: 'User not found', 
        message: 'User with this clerk_id does not exist' 
      });
    }

    res.json({ 
      success: true, 
      message: 'User settings updated successfully' 
    });
  } catch (error) {
    console.error('[Users-Controller] Error:', error);
    res.status(500).json({ 
      error: 'Failed to update user settings', 
      message: error.message 
    });
  }
}

// Delete user
export async function deleteUser(req, res) {
  try {
    const { clerk_id } = req.params;
    
    if (!clerk_id) {
      return res.status(400).json({ 
        error: 'Missing clerk_id', 
        message: 'clerk_id is required' 
      });
    }

    const mongoClient = await getMongoClient();
    const db = mongoClient.db(MONGODB_DB_NAME);
    const usersCollection = db.collection('users');

    const result = await usersCollection.deleteOne({ clerk_id });

    if (result.deletedCount === 0) {
      return res.status(404).json({ 
        error: 'User not found', 
        message: 'User with this clerk_id does not exist' 
      });
    }

    res.json({ 
      success: true, 
      message: 'User deleted successfully' 
    });
  } catch (error) {
    console.error('[Users-Controller] Error:', error);
    res.status(500).json({ 
      error: 'Failed to delete user', 
      message: error.message 
    });
  }
} 