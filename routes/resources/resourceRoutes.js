import { Router } from 'express';
import { getResources, createResource, updateResource, deleteResource } from '../../controllers/resources/resource.controller.js';

const router = Router({ mergeParams: true });

// Inject workspaceId from URL params into req
router.use((req, _res, next) => {
  req.workspaceId = req.params.workspaceId;
  next();
});

router.get('/', getResources);
router.post('/', createResource);
router.patch('/:id', updateResource);
router.delete('/:id', deleteResource);

export default router;
