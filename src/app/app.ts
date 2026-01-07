import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { Task, Category } from './models/task.model';
import { TaskService } from './services/task';
import { CommonModule } from '@angular/common';
import { CdkDragDrop, DragDropModule, moveItemInArray } from '@angular/cdk/drag-drop';

@Component({
  selector: 'app-root',
  imports: [CommonModule, DragDropModule],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App implements OnInit {
  private taskService = inject(TaskService);

  tasks = signal<Task[]>([]);
  categories = signal<Category[]>([]);
  selectedCategoryId = signal<string | null>(null);

  // Columnas filtradas (estas se usan para mostrar)
  pendingTasks = computed(() => this.tasks().filter(t => t.status === 'PENDING' && (!this.selectedCategoryId() || t.categoryId === this.selectedCategoryId())));
  inProgressTasks = computed(() => this.tasks().filter(t => t.status === 'IN_PROGRESS' && (!this.selectedCategoryId() || t.categoryId === this.selectedCategoryId())));
  doneTasks = computed(() => this.tasks().filter(t => t.status === 'DONE' && (!this.selectedCategoryId() || t.categoryId === this.selectedCategoryId())));

  ngOnInit() {
    this.loadData();
  }

  loadData() {
    this.taskService.getTasks().subscribe(data => this.tasks.set(data));
    this.taskService.getCategories().subscribe(data => this.categories.set(data));
  }

  // MÉTODO PARA MANEJAR EL SOLTADO DE TARJETAS
  drop(event: CdkDragDrop<Task[]>, newStatus: string) {
    const task = event.item.data as Task;

    if (event.previousContainer === event.container) {
      if (event.previousIndex === event.currentIndex) return;

      // Para reordenar dentro de la misma columna con Signals, 
      // tendríamos que implementar una lógica de ordenamiento real.
      // Por ahora, moveItemInArray lo hace visualmente en el array local.
      moveItemInArray(event.container.data, event.previousIndex, event.currentIndex);
    } else {
      // 1. Actualizar en el Backend
      this.taskService.updateTaskStatus(task.id, newStatus).subscribe({
        error: (err) => {
          console.error('Error al actualizar tarea:', err);
          // Opcional: revertir el cambio local si falla
        }
      });

      // 2. Actualizar localmente el Signal
      this.tasks.update(prevTasks =>
        prevTasks.map(t => t.id === task.id ? { ...t, status: newStatus as any } : t)
      );
    }
  }

  selectCategory(id: string | null) {
    this.selectedCategoryId.set(id);
  }
}
