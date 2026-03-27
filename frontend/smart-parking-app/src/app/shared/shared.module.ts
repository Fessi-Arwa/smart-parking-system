import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { RouterModule } from '@angular/router';

import { HeaderComponent } from './components/header/header.component';
import { MapComponent } from './components/map/map.component';
import { NavbarComponent } from './components/navbar/navbar.component';

@NgModule({
  declarations: [HeaderComponent, NavbarComponent, MapComponent],
  imports: [CommonModule, IonicModule, RouterModule],
  exports: [HeaderComponent, NavbarComponent, MapComponent]
})
export class SharedModule { }
