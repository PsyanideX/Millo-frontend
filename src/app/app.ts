import { Component, computed, inject, OnInit, signal, AfterViewInit, ViewChild, ElementRef } from '@angular/core';
import { Task, Category, Column } from './models/task.model';
import { TaskService } from './services/task';
import { CommonModule } from '@angular/common';
import { CdkDragDrop, DragDropModule, moveItemInArray, transferArrayItem } from '@angular/cdk/drag-drop';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-root',
  imports: [CommonModule, DragDropModule, FormsModule],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App implements OnInit, AfterViewInit {
  private taskService = inject(TaskService);

  @ViewChild('boardCanvas') boardCanvas?: ElementRef<HTMLDivElement>;

  // Board structure (now based on Columns as per API)
  columns = signal<Column[]>([]);
  categories = signal<Category[]>([]);
  selectedCategoryId = signal<string | null>(null);

  columnIds = computed(() => this.columns().map(c => c.id));

  // Modal state
  isModalOpen = signal(false);
  modalMode = signal<'LIST' | 'CARD'>('CARD');
  modalTitle = signal('');
  currentColumnId = signal<string | null>(null);
  overlayMouseDown = false;

  // Form signals
  formTitle = signal('');
  formDescription = signal('');
  formCategoryId = signal<string | null>(null);
  formEffortPoints = signal<number>(0);

  // Category creation signals
  showNewCategoryForm = signal(false);
  newCategoryName = signal('');
  newCategoryColor = signal('#0079bf');

  ngOnInit() {
    this.loadInitialData();
  }

  ngAfterViewInit() {
    // Reset scroll position to the start (left)
    if (this.boardCanvas?.nativeElement) {
      this.boardCanvas.nativeElement.scrollLeft = 0;
    }
  }

  loadInitialData() {
    // 1. Load Categories
    this.taskService.getCategories().subscribe(data => {
      this.categories.set(data);
    });

    // 2. Load Columns and then Tasks
    this.taskService.getColumns().subscribe({
      next: (columns) => {
        this.columns.set(columns.sort((a, b) => a.order - b.order));
        this.loadTasksForAllColumns();
      },
      error: () => {
        // Mock columns if backend fails
        const mockCols: Column[] = [
          { id: 'c1', name: 'Pendientes', order: 1, createdAt: new Date(), tasks: [] },
          { id: 'c2', name: 'En Proceso', order: 2, createdAt: new Date(), tasks: [] },
          { id: 'c3', name: 'Hecho', order: 3, createdAt: new Date(), tasks: [] }
        ];
        this.columns.set(mockCols);
      }
    });
  }

  loadTasksForAllColumns() {
    this.taskService.getTasks().subscribe(tasks => {
      // Group tasks by columnId
      this.columns.update(cols => cols.map(col => ({
        ...col,
        tasks: tasks.filter(t => t.columnId === col.id)
      })));
    });
  }

  drop(event: CdkDragDrop<Task[] | undefined>, columnId: string) {
    if (!event.container.data || !event.previousContainer.data) return;

    if (event.previousContainer === event.container) {
      moveItemInArray(event.container.data, event.previousIndex, event.currentIndex);
      // Optional: Update order in backend if needed
    } else {
      const task = event.item.data as Task;
      transferArrayItem(
        event.previousContainer.data,
        event.container.data,
        event.previousIndex,
        event.currentIndex
      );

      // Update Column ID in Backend
      this.taskService.updateTask(task.id, { columnId }).subscribe();
    }

    // Ensure reactivity
    this.columns.set([...this.columns()]);
  }

  selectCategory(id: string | null) {
    this.selectedCategoryId.set(id);
  }

  getColumnEffortTotal(column: Column): number {
    return (column.tasks || []).reduce((acc, task) => acc + (task.effortPoints || 0), 0);
  }

  openAddColumnModal() {
    this.modalMode.set('LIST'); // Keep internal name for less refactoring in HTML
    this.modalTitle.set('Añadir una columna');
    this.formTitle.set('');
    this.isModalOpen.set(true);
  }

  openAddCardModal(columnId: string) {
    this.modalMode.set('CARD');
    this.modalTitle.set('Añadir una tarjeta');
    this.currentColumnId.set(columnId);
    this.formTitle.set('');
    this.formDescription.set('');
    this.formCategoryId.set(null);
    this.formEffortPoints.set(0);
    this.showNewCategoryForm.set(false);
    this.isModalOpen.set(true);
  }

  closeModal() {
    this.isModalOpen.set(false);
  }

  handleOverlayMouseDown(event: MouseEvent) {
    this.overlayMouseDown = event.target === event.currentTarget;
  }

  handleOverlayClick(event: MouseEvent) {
    if (this.overlayMouseDown && event.target === event.currentTarget) {
      this.closeModal();
    }
  }

  toggleCategoryForm() {
    this.showNewCategoryForm.update(prev => !prev);
    if (this.showNewCategoryForm()) {
      this.newCategoryName.set('');
    }
  }

  submitModal() {
    const title = this.formTitle();
    if (!title) return;

    if (this.modalMode() === 'LIST') {
      this.addColumn(title);
    } else {
      if (this.showNewCategoryForm() && this.newCategoryName()) {
        this.taskService.createCategory(this.newCategoryName(), this.newCategoryColor()).subscribe(newCat => {
          this.categories.update(prev => [...prev, newCat]);
          this.addCard(title, this.formDescription(), newCat.id, this.formEffortPoints());
        });
      } else {
        this.addCard(title, this.formDescription(), this.formCategoryId(), this.formEffortPoints());
      }
    }
    this.closeModal();
  }

  private addColumn(name: string) {
    this.taskService.createColumn(name, this.columns().length).subscribe(newCol => {
      this.columns.update(prev => [...prev, { ...newCol, tasks: [] }]);
    });
  }

  private addCard(title: string, description: string, categoryId: string | null, effortPoints: number) {
    const columnId = this.currentColumnId()!;
    this.taskService.createTask({
      title,
      description,
      effortPoints,
      categoryId: categoryId || undefined,
      columnId
    }).subscribe(newTask => {
      // Backend might not return the full category object, let's find it locally
      const category = this.categories().find(c => c.id === categoryId);
      const taskWithCategory = { ...newTask, category };

      this.columns.update(cols => cols.map(c =>
        c.id === columnId ? { ...c, tasks: [...(c.tasks || []), taskWithCategory] } : c
      ));
    });
  }
}
