import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import {
  uploadSingleExcel,
  uploadStudents,
  uploadQuestions,
  exportQuestionsExcel,
  exportStudentsExcel,
  dashboard,
  listResults,
  resetStudent,
  resetAllExams,
  deleteStudent,
  bulkDeleteStudents,
  updateStudent,
  bulkUpdateStudents,
} from '../controllers/adminController.js';

export const adminRoutes = Router();

adminRoutes.use(requireAuth, requireRole('admin'));

adminRoutes.get('/dashboard', dashboard);
adminRoutes.get('/results', listResults);
adminRoutes.get('/export/questions', exportQuestionsExcel);
adminRoutes.get('/export/students', exportStudentsExcel);
adminRoutes.post('/upload/students', uploadSingleExcel, uploadStudents);
adminRoutes.post('/upload/questions', uploadSingleExcel, uploadQuestions);
adminRoutes.post('/students/bulk-delete', bulkDeleteStudents);
adminRoutes.patch('/students/bulk-update', bulkUpdateStudents);
adminRoutes.post('/students/reset-all-exams', resetAllExams);
adminRoutes.post('/students/:studentId/reset', resetStudent);
adminRoutes.patch('/students/:studentId', updateStudent);
adminRoutes.delete('/students/:studentId', deleteStudent);

