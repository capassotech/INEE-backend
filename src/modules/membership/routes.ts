import { Router } from 'express';
import { getMembership, createMembership, updateMembership, deleteMembership, getMembershipById } from './controller';
import { validateBody, validateParams, validateMultiple } from '../../middleware/zodValidation';
import { 
  CreateMembershipSchema, 
  UpdateMembershipSchema, 
  MembershipIdSchema 
} from '../../types/membership';

const router = Router();

router.get('/', getMembership);

router.get('/:id', 
  validateParams(MembershipIdSchema), 
  getMembershipById
);

router.post('/', 
  validateBody(CreateMembershipSchema), 
  createMembership
);

router.put('/:id', 
  validateMultiple({
    params: MembershipIdSchema,
    body: UpdateMembershipSchema
  }),
  updateMembership
);

router.delete('/:id', 
  validateParams(MembershipIdSchema), 
  deleteMembership
);

export default router;
