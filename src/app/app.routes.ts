import { Routes } from '@angular/router';
import { LoginComponent } from './components/login/login';
import { RegisterComponent } from './components/register/register';
import { DashboardComponent } from './components/dashboard/dashboard';
import { authGuard, publicGuard } from './guards/auth.guard';

export const routes: Routes = [
  {
    path: 'login',
    component: LoginComponent,
    canActivate: [publicGuard]
  },
  {
    path: 'register',
    component: RegisterComponent,
    canActivate: [publicGuard]
  },
  {
    path: 'dashboard',
    component: DashboardComponent,
    canActivate: [authGuard]
  },
  {
    path: '',
    redirectTo: '/dashboard',
    pathMatch: 'full'
  }
];
