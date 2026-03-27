import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { OwnerRoutingModule } from './owner-routing.module';
import { SharedModule } from '../../shared/shared.module';
import { AiSetupPage } from './ai-setup/ai-setup.page';
import { ParkingSetupPage } from './parking-setup/parking-setup.page';
import { PendingPage } from './pending/pending.page';
import { SubscriptionPage } from './subscription/subscription.page';
import { WorkflowPage } from './workflow/workflow.page';

@NgModule({
  imports: [
    CommonModule,
    IonicModule,
    OwnerRoutingModule,
    SharedModule
  ],
  declarations: [
    WorkflowPage,
    PendingPage,
    SubscriptionPage,
    ParkingSetupPage,
    AiSetupPage,
  ],
})
export class OwnerModule { }
