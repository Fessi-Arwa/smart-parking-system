export type OwnerValidationStatus = 'en_attente' | 'accepte' | 'refuse' | 'suspendu';
export type ParkingValidationStatus = 'brouillon' | 'en_attente_validation' | 'valide' | 'rejete';
export type SubscriptionStatus = 'non_souscrit' | 'en_attente_paiement' | 'actif' | 'expire' | 'suspendu';
export type SetupStatus = 'non_commencee' | 'en_cours' | 'terminee';
export type AiSetupStatus = 'non_configuree' | 'en_cours' | 'testee' | 'active';

export interface OwnerWorkflowState {
  ownerStatus: OwnerValidationStatus;
  parkingStatus: ParkingValidationStatus;
  subscriptionStatus: SubscriptionStatus;
  parkingSetupStatus: SetupStatus;
  aiSetupStatus: AiSetupStatus;
}

export const DEFAULT_OWNER_WORKFLOW_STATE: OwnerWorkflowState = {
  ownerStatus: 'en_attente',
  parkingStatus: 'en_attente_validation',
  subscriptionStatus: 'non_souscrit',
  parkingSetupStatus: 'non_commencee',
  aiSetupStatus: 'non_configuree',
};
