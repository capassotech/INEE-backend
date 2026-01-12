import { Router } from 'express';
import { getMembership, getMembershipById, updateMembership } from './controller';
import { validateParams, validateMultiple } from '../../middleware/zodValidation';
import { 
  UpdateMembershipSchema, 
  MembershipIdSchema 
} from '../../types/membership';

const router = Router();

router.get('/', getMembership);

router.get('/:id', 
  validateParams(MembershipIdSchema), 
  getMembershipById
);

router.put('/:id', 
  validateMultiple({
    params: MembershipIdSchema,
    body: UpdateMembershipSchema
  }),
  updateMembership
);

export default router;