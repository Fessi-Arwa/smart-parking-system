import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { RouterModule } from '@angular/router';

import { HeaderComponent } from './components/header/header.component';
import { NavbarComponent } from './components/navbar/navbar.component';

@NgModule({
  declarations: [HeaderComponent, NavbarComponent],
  imports: [CommonModule, IonicModule, RouterModule],
  exports: [HeaderComponent, NavbarComponent]  // ← Important : exporte les composants
})
export class SharedModule { }