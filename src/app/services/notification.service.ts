import { Injectable, signal } from '@angular/core';

export type NotificationType = 'success' | 'error';

export interface Notification {
  id: number;
  type: NotificationType;
  message: string;
}

@Injectable({
  providedIn: 'root',
})
export class NotificationService {
  notifications = signal<Notification[]>([]);
  private nextId = 0;

  show(message: string, type: NotificationType = 'success', duration = 5000) {
    const id = this.nextId++;
    const notification: Notification = { id, message, type };
    
    this.notifications.update((prev) => [...prev, notification]);

    setTimeout(() => {
      this.remove(id);
    }, duration);
  }

  success(message: string) {
    this.show(message, 'success');
  }

  error(message: string) {
    this.show(message, 'error');
  }

  remove(id: number) {
    this.notifications.update((prev) => prev.filter((n) => n.id !== id));
  }
}
