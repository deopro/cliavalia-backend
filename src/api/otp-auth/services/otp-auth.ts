/**
 * OTP Auth Service
 * Handles OTP generation, sending via WhatsApp, and verification
 */

export default ({ strapi }: { strapi: any }) => {
  /**
   * Generate a 6-digit OTP code
   * @returns 6-digit OTP string
   */
  const generateOTP = (): string => {
    return Math.floor(100000 + Math.random() * 900000).toString();
  };

  /**
   * Validate E.164 phone number format
   * @param phoneNumber - Phone number to validate
   * @returns boolean - true if valid E.164 format
   */
  const validatePhoneNumber = (phoneNumber: string): boolean => {
    // E.164 format: +[country code][number] (max 20 chars total)
    const e164Regex = /^\+[1-9]\d{1,14}$/;
    return e164Regex.test(phoneNumber) && phoneNumber.length <= 20;
  };

  /**
   * Send OTP via WhatsApp Cloud API
   * @param phoneNumber - E.164 format phone number
   * @param otpCode - 6-digit OTP code
   * @returns Promise<void>
   */
  const sendOTPViaWhatsApp = async (phoneNumber: string, otpCode: string): Promise<void> => {
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
    const apiVersion = process.env.WHATSAPP_API_VERSION || 'v18.0';

    if (!phoneNumberId || !accessToken) {
      strapi.log.error('WhatsApp API credentials not configured');
      throw new Error('WhatsApp service not configured');
    }

    const whatsappApiUrl = `https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`;

    try {
      // Use native fetch (available in Node.js 18+)
      const response = await fetch(whatsappApiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: phoneNumber,
          type: 'template',
          template: {
            name: 'otp_verification', // Template name in Meta Business Manager
            language: {
              code: 'en',
            },
            components: [
              {
                type: 'body',
                parameters: [
                  {
                    type: 'text',
                    text: otpCode,
                  },
                ],
              },
            ],
          },
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        strapi.log.error('WhatsApp API error:', {
          status: response.status,
          statusText: response.statusText,
          error: errorData,
        });
        throw new Error(`Failed to send WhatsApp message: ${response.statusText}`);
      }

      const result = await response.json() as { messages?: Array<{ id?: string }> };
      strapi.log.info('OTP sent via WhatsApp:', {
        phoneNumber,
        messageId: result.messages?.[0]?.id,
      });
    } catch (error: any) {
      strapi.log.error('Error sending OTP via WhatsApp:', error);
      // In development, log the OTP instead of failing
      if (process.env.NODE_ENV === 'development') {
        strapi.log.warn(`[DEV] OTP for ${phoneNumber}: ${otpCode}`);
      }
      throw new Error(`Failed to send OTP: ${error?.message || 'Unknown error'}`);
    }
  };

  /**
   * Send OTP to phone number
   * Creates or updates user with OTP code and expiry
   * @param phoneNumber - E.164 format phone number
   * @returns Promise<void>
   */
  const sendOTP = async (phoneNumber: string): Promise<void> => {
    // Validate phone number format
    if (!validatePhoneNumber(phoneNumber)) {
      throw new Error('Invalid phone number format. Please use E.164 format (e.g., +244912345678)');
    }

    // Generate OTP
    const otpCode = generateOTP();
    const otpExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes from now

    // Find existing user by phone number using documents API to get documentId
    let existingUser: any = null;
    try {
      const users = await strapi.documents('plugin::users-permissions.user').findMany({
        filters: { phoneNumber },
        limit: 1,
      });
      if (users && users.length > 0) {
        existingUser = users[0];
      }
    } catch (docError: any) {
      // Fallback to db.query if documents API fails
      strapi.log.warn('Error using documents API, falling back to db.query:', docError);
      existingUser = await strapi.db
        .query('plugin::users-permissions.user')
        .findOne({
          where: { phoneNumber },
        });
    }

    try {
      if (existingUser) {
        // Update existing user with OTP
        if (existingUser.documentId) {
          // Use documents API if we have documentId
          await strapi.documents('plugin::users-permissions.user').update({
            documentId: existingUser.documentId,
            data: {
              otpCode,
              otpExpiry,
            },
          });
        } else {
          // Fallback to db.query for update
          await strapi.db
            .query('plugin::users-permissions.user')
            .update({
              where: { id: existingUser.id },
              data: {
                otpCode,
                otpExpiry,
              },
            });
        }
        strapi.log.info('OTP updated for existing user:', existingUser.id || existingUser.documentId);
      } else {
        // Create new user with OTP
        // Generate unique username from phone number
        const phoneUsername = `user_${phoneNumber.replace(/\+/g, '').replace(/\s/g, '')}`;
        
        // Get default role
        const defaultRole = await strapi.db
          .query('plugin::users-permissions.role')
          .findOne({
            where: { type: 'authenticated' },
          });

        // Ensure username is unique
        let username = phoneUsername;
        let usernameExists = true;
        let attempts = 0;
        while (usernameExists && attempts < 10) {
          const existingUserWithUsername = await strapi.db
            .query('plugin::users-permissions.user')
            .findOne({
              where: { username },
            });
          
          if (!existingUserWithUsername) {
            usernameExists = false;
          } else {
            attempts++;
            username = `${phoneUsername}_${attempts}`;
          }
        }

        // Create user with minimal required fields
        // Note: email is required but we'll use a placeholder
        const email = `${username}@whatsapp.temp`;
        const firstName = phoneNumber.substring(phoneNumber.length - 4); // Last 4 digits as fallback
        const lastName = 'User';

        await strapi.documents('plugin::users-permissions.user').create({
          data: {
            username,
            email,
            phoneNumber,
            firstName,
            lastName,
            otpCode,
            otpExpiry,
            confirmed: false, // Will be confirmed after OTP verification
            role: defaultRole?.id,
          },
        });
        strapi.log.info('New user created with OTP:', username);
      }

      // Send OTP via WhatsApp
      await sendOTPViaWhatsApp(phoneNumber, otpCode);
    } catch (error: any) {
      strapi.log.error('Error in sendOTP:', error);
      throw error;
    }
  };

  /**
   * Verify OTP code
   * @param phoneNumber - E.164 format phone number
   * @param code - 6-digit OTP code
   * @returns Promise<{ user: any, jwt: string }>
   */
  const verifyOTP = async (phoneNumber: string, code: string): Promise<{ user: any; jwt: string }> => {
    // Validate phone number format
    if (!validatePhoneNumber(phoneNumber)) {
      throw new Error('Invalid phone number format');
    }

    // Validate OTP code format
    if (!/^\d{6}$/.test(code)) {
      throw new Error('Invalid OTP code format. Must be 6 digits');
    }

    // Find user by phone number
    const users = await strapi.db
      .query('plugin::users-permissions.user')
      .findMany({
        where: { phoneNumber },
        populate: ['role'],
        limit: 1,
      });
    
    const user = users && users.length > 0 ? users[0] : null;

    if (!user) {
      throw new Error('User not found. Please request a new OTP');
    }

    // Check if OTP code matches
    if (user.otpCode !== code) {
      throw new Error('Invalid OTP code');
    }

    // Check if OTP has expired
    if (!user.otpExpiry || new Date(user.otpExpiry) < new Date()) {
      throw new Error('OTP code has expired. Please request a new one');
    }

    // Clear OTP fields
    try {
      const documentService = strapi.documents('plugin::users-permissions.user');
      const userDoc = await documentService.findOne({
        documentId: user.documentId || user.id,
      });
      
      if (userDoc) {
        await documentService.update({
          documentId: userDoc.documentId,
          data: {
            otpCode: null,
            otpExpiry: null,
            confirmed: true, // Confirm user after successful OTP verification
          },
        });
      } else {
        // Fallback to db query update
        await strapi.db
          .query('plugin::users-permissions.user')
          .update({
            where: { id: user.id },
            data: {
              otpCode: null,
              otpExpiry: null,
              confirmed: true,
            },
          });
      }
    } catch (updateError: any) {
      strapi.log.error('Error clearing OTP fields:', updateError);
      // Continue anyway - OTP is verified
    }

    // Generate JWT token
    const jwtService = strapi.plugin('users-permissions').service('jwt');
    if (!jwtService || !jwtService.issue) {
      throw new Error('JWT service not available');
    }

    const jwt = jwtService.issue({ id: user.id });
    if (!jwt) {
      throw new Error('Failed to generate JWT token');
    }

    // Return user data (without sensitive fields)
    const userData = {
      id: user.id,
      email: user.email,
      username: user.username,
      firstName: user.firstName,
      lastName: user.lastName,
      phoneNumber: user.phoneNumber,
      confirmed: true,
      role: user.role ? {
        id: user.role.id,
        name: user.role.name,
        type: user.role.type,
      } : undefined,
    };

    return {
      user: userData,
      jwt,
    };
  };

  return {
    generateOTP,
    validatePhoneNumber,
    sendOTPViaWhatsApp,
    sendOTP,
    verifyOTP,
  };
};
