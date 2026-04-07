import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import {
  getExamData,
  startExam,
  saveAnswer,
  submitExam,
  getResult,
} from '../controllers/studentController.js';

export const studentRoutes = Router();

studentRoutes.use(requireAuth, requireRole('student'));

studentRoutes.get('/exam', getExamData);
studentRoutes.post('/exam/start', startExam);
studentRoutes.post('/exam/answer', saveAnswer);
studentRoutes.post('/exam/submit', submitExam);
studentRoutes.get('/exam/result', getResult);

