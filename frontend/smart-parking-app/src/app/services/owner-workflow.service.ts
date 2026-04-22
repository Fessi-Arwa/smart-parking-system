import { HttpClient, HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { BehaviorSubject, firstValueFrom } from 'rxjs';
import { environment } from 'src/environments/environment';

import {
  AiSetupStatus,
  DEFAULT_OWNER_WORKFLOW_STATE,
  OwnerWorkflowState,
  SetupStatus,
} from '../models/owner-workflow.model';
import { AuthService } from './auth.service';

@Injectable({
  providedIn: 'root',
})
export class OwnerWorkflowService {
  private readonly apiUrl = `${environment.apiBaseUrl}/owner`;
  private readonly stateSubject = new BehaviorSubject<OwnerWorkflowState>(DEFAULT_OWNER_WORKFLOW_STATE);

  readonly state$ = this.stateSubject.asObservable();

  constructor(
    private http: HttpClient,
    private authService: AuthService
  ) {}

  getSnapshot(): OwnerWorkflowState {
    return this.stateSubject.value;
  }

  async refresh(): Promise<OwnerWorkflowState> {
    const headers = this.buildAuthHeaders();
    if (!headers) {
      this.stateSubject.next(DEFAULT_OWNER_WORKFLOW_STATE);
      return DEFAULT_OWNER_WORKFLOW_STATE;
    }

    let state: OwnerWorkflowState;
    try {
      state = await firstValueFrom(
        this.http.get<OwnerWorkflowState>(`${this.apiUrl}/workflow-status`, {
          headers,
        })
      );
    } catch (error) {
      if (error instanceof HttpErrorResponse && error.status === 401) {
        this.stateSubject.next(DEFAULT_OWNER_WORKFLOW_STATE);
        return DEFAULT_OWNER_WORKFLOW_STATE;
      }
      throw error;
    }

    const normalizedState = {
      ...DEFAULT_OWNER_WORKFLOW_STATE,
      ...state,
    };
    this.stateSubject.next(normalizedState);
    return normalizedState;
  }

  getNextRoute(state: OwnerWorkflowState = this.getSnapshot()): string {
    if (state.ownerStatus !== 'accepte') {
      return '/owner/pending';
    }

    if (!state.hasParking) {
      return '/owner/profile';
    }

    if (state.parkingStatus !== 'valide') {
      return '/owner/pending';
    }

    if (state.subscriptionStatus !== 'actif') {
      return '/owner/subscription';
    }

    if (state.parkingSetupStatus !== 'terminee') {
      return '/owner/parking-setup';
    }

    if (state.aiSetupStatus !== 'active') {
      return '/owner/ai-setup';
    }

    return '/owner/overview';
  }

  async activateAppSubscription(): Promise<OwnerWorkflowState> {
    return this.activateAppSubscriptionRequest({});
  }

  async activateAppSubscriptionRequest(payload: {
    parking_id?: number | null;
    type?: 'mensuel' | 'trimestriel' | 'annuel';
    payment_mode?: 'en_ligne' | 'sur_place';
  }): Promise<OwnerWorkflowState> {
    await firstValueFrom(
      this.http.post(
        `${this.apiUrl}/app-subscription`,
        payload,
        { headers: this.buildAuthHeaders() }
      )
    );

    return this.refresh();
  }

  async updateParkingSetupStatus(
    parkingId: number,
    setupStatus: SetupStatus
  ): Promise<OwnerWorkflowState> {
    await firstValueFrom(
      this.http.put(
        `${this.apiUrl}/parkings/${parkingId}/setup-status`,
        { setup_status: setupStatus },
        { headers: this.buildAuthHeaders() }
      )
    );

    return this.refresh();
  }

  async updateAiSetupStatus(
    parkingId: number,
    aiSetupStatus: AiSetupStatus
  ): Promise<OwnerWorkflowState> {
    await firstValueFrom(
      this.http.put(
        `${this.apiUrl}/parkings/${parkingId}/ai-setup-status`,
        { ai_setup_status: aiSetupStatus },
        { headers: this.buildAuthHeaders() }
      )
    );

    return this.refresh();
  }

  private buildAuthHeaders(): HttpHeaders | undefined {
    const token = this.authService.getToken();
    if (!token) {
      this.authService.handleUnauthorized();
      return undefined;
    }

    return new HttpHeaders({ Authorization: `Bearer ${token}` });
  }
}
