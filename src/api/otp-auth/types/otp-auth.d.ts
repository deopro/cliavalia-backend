/**
 * Type definitions for OTP Auth API
 */

export interface SendOTPRequest {
  phoneNumber: string; // E.164 format
}

export interface VerifyOTPRequest {
  phoneNumber: string; // E.164 format
  code: string; // 6-digit OTP
}

export interface VerifyOTPResponse {
  jwt: string;
  user: {
    id: number;
    email: string;
    username: string;
    firstName: string;
    lastName: string;
    phoneNumber: string;
    confirmed: boolean;
    role?: {
      id: number;
      name: string;
      type: string;
    };
  };
}
