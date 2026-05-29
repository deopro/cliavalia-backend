/**
 * Review validation schemas
 * 
 * These schemas validate incoming review data before processing
 */

import { yup } from '@strapi/utils';

/**
 * Schema for creating a new review
 */
export const createReviewSchema = yup.object().shape({
  title: yup
    .string()
    .required('Title is required')
    .min(3, 'Title must be at least 3 characters')
    .max(100, 'Title must not exceed 100 characters'),
  
  rating: yup
    .number()
    .required('Rating is required')
    .min(1, 'Rating must be at least 1')
    .max(5, 'Rating must not exceed 5')
    .integer('Rating must be an integer'),
  
  reviewText: yup
    .mixed()
    .required('Review text is required'),
  
  business: yup
    .number()
    .required('Business ID is required')
    .positive('Business ID must be a positive number')
    .integer('Business ID must be an integer'),
});

/**
 * Schema for updating an existing review
 */
export const updateReviewSchema = yup.object().shape({
  title: yup
    .string()
    .min(3, 'Title must be at least 3 characters')
    .max(100, 'Title must not exceed 100 characters')
    .optional(),
  
  rating: yup
    .number()
    .min(1, 'Rating must be at least 1')
    .max(5, 'Rating must not exceed 5')
    .integer('Rating must be an integer')
    .optional(),
  
  reviewText: yup
    .mixed()
    .optional(),
});

/**
 * Validate review creation data
 * @param data - The review data to validate
 * @throws ValidationError if validation fails
 */
export async function validateCreateReview(data: any) {
  try {
    await createReviewSchema.validate(data, { abortEarly: false });
  } catch (error) {
    if (error instanceof yup.ValidationError) {
      throw new Error(error.errors.join(', '));
    }
    throw error;
  }
}

/**
 * Validate review update data
 * @param data - The review data to validate
 * @throws ValidationError if validation fails
 */
export async function validateUpdateReview(data: any) {
  try {
    await updateReviewSchema.validate(data, { abortEarly: false });
  } catch (error) {
    if (error instanceof yup.ValidationError) {
      throw new Error(error.errors.join(', '));
    }
    throw error;
  }
}

