import { Component, input, signal, inject, computed, OnInit, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { BoardService } from '../../../services/board';
import { AuthService } from '../../../services/auth';
import { Board, BoardMember } from '../../../models/task.model';

@Component({
  selector: 'app-board-members',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './board-members.component.html',
  styleUrl: './board-members.component.scss'
})
export class BoardMembersComponent {
  private boardService = inject(BoardService);
  public authService = inject(AuthService);

  boardId = input.required<string>();
  ownerId = input.required<string>();

  isOpen = signal(false);
  members = signal<BoardMember[]>([]);
  formEmail = signal('');
  formRole = signal<'viewer' | 'editor' | 'owner'>('viewer');
  overlayMouseDown = false;

  constructor() {
    effect(() => {
        const id = this.boardId();
        if (id && this.isOpen()) {
            this.loadMembers();
        }
    });
  }

  open() {
    this.isOpen.set(true);
    this.loadMembers();
  }

  close() {
    this.isOpen.set(false);
  }

  loadMembers() {
    this.boardService.getBoardMembers(this.boardId()).subscribe({
      next: (members) => this.members.set(members),
      error: (err) => console.error('Error loading members:', err)
    });
  }

  shareBoard() {
    const email = this.formEmail();
    const role = this.formRole();

    if (!email) return;

    this.boardService.addMember(this.boardId(), { email, role }).subscribe({
      next: (member) => {
        this.members.update(prev => [...prev, member]);
        this.formEmail.set('');
      },
      error: (err) => {
        console.error('Error adding member:', err);
        alert('Error al añadir miembro: ' + (err.error?.message || err.message));
      }
    });
  }

  removeMember(memberId: string) {
    if (!confirm('¿Estás seguro de que quieres eliminar a este miembro?')) return;

    this.boardService.deleteMember(this.boardId(), memberId).subscribe({
      next: () => {
        this.members.update(prev => prev.filter(m => m.id !== memberId));
      },
      error: (err) => console.error('Error removing member:', err)
    });
  }

  handleOverlayMouseDown(event: MouseEvent) {
    this.overlayMouseDown = event.target === event.currentTarget;
  }

  handleOverlayClick(event: MouseEvent) {
    if (this.overlayMouseDown && event.target === event.currentTarget) {
      this.close();
    }
  }
}
