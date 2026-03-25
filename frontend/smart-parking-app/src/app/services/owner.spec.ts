import { TestBed } from '@angular/core/testing';

import { Owner } from './owner';

describe('Owner', () => {
  let service: Owner;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(Owner);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
