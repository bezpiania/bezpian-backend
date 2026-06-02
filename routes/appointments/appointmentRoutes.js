import express from 'express';
import AppointmentController from '../../controllers/appointments/appointment.controller.js';

const router = express.Router({ mergeParams: true });
const appointmentController = new AppointmentController();

router.post('/', appointmentController.create);
router.get('/', appointmentController.list);
router.get('/:id', appointmentController.get);
router.patch('/:id', appointmentController.updateStatus);
router.post('/:id/reschedule', appointmentController.reschedule);
router.post('/:id/remind', appointmentController.sendReminder);

export default router;
