import { z } from 'zod';

export const CourseImageParamsSchema = z.object({
  courseId: z.string().min(1, 'courseId es requerido'),
});

export type CourseImageParams = z.infer<typeof CourseImageParamsSchema>;
