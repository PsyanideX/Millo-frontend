import { Component, computed, inject, OnInit, signal, AfterViewInit, ViewChild, ElementRef, HostListener } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { CdkDragDrop, DragDropModule, moveItemInArray, transferArrayItem } from '@angular/cdk/drag-drop';
import { FormsModule } from '@angular/forms';
import { forkJoin } from 'rxjs';
import { TaskService } from '../../services/task';
import { BoardService } from '../../services/board';
import { AuthService } from '../../services/auth';
import { NotificationService } from '../../services/notification.service';
import { GanttChartComponent } from './gantt-chart/gantt-chart.component';
import { FinancialSummaryComponent } from './financial-summary/financial-summary.component';
import { BoardMembersComponent } from './board-members/board-members.component';
import { Column, Category, Task, TaskItem, Board, BoardMember } from '../../models/task.model';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, DragDropModule, FormsModule, GanttChartComponent, FinancialSummaryComponent, BoardMembersComponent],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.scss'
})
export class DashboardComponent implements OnInit, AfterViewInit {
  private taskService = inject(TaskService);
  private boardService = inject(BoardService);
  public authService = inject(AuthService);
  private router = inject(Router);
  private notificationService = inject(NotificationService);

  @ViewChild('boardCanvas') boardCanvas?: ElementRef<HTMLDivElement>;
  @ViewChild(GanttChartComponent) ganttChart?: GanttChartComponent;
  @ViewChild(FinancialSummaryComponent) financialSummary?: FinancialSummaryComponent;
  @ViewChild(BoardMembersComponent) boardMembersModal?: BoardMembersComponent;

  // Board state
  currentBoard = signal<Board | null>(null);
  boards = signal<Board[]>([]);
  primaryBoardSignal = computed(() => this.boards().find(b => b.isPrimary));
  secondaryBoards = computed(() => this.boards().filter(b => b.ownerId === this.authService.currentUser()?.id && !b.isPrimary));
  sharedBoards = computed(() => this.boards().filter(b => !b.isPrimary && b.ownerId !== this.authService.currentUser()?.id));

  // Board structure (now based on Columns as per API)
  columns = signal<Column[]>([]);
  categories = signal<Category[]>([]);
  selectedCategoryId = signal<string | null>(null);

  columnIds = computed(() => this.columns().map(c => c.id));

  itemsTotal = computed(() => {
    return this.formItems().reduce((sum, item) => sum + (item.quantity * item.price), 0);
  });

  // Modal state
  isModalOpen = signal(false);
  modalMode = signal<'LIST' | 'CARD' | 'EDIT' | 'BOARD' | 'MOVE' | 'CONFIRM'>('CARD');
  modalTitle = signal('');
  confirmTitle = signal('');
  confirmMessage = signal('');
  private pendingAction: (() => void) | null = null;
  currentColumnId = signal<string | null>(null);

  // Bulk Move state
  selectedTaskIds = signal<Set<string>>(new Set());
  targetBoardId = signal<string | null>(null);
  targetColumnId = signal<string | null>(null);
  targetBoardColumns = signal<Column[]>([]);



  activeColumnMenuId = signal<string | null>(null);

  openAddBoardModal() {
    this.modalMode.set('BOARD');
    this.modalTitle.set('Crear nuevo tablero');
    this.formTitle.set('');
    this.formDescription.set('');
    this.isModalOpen.set(true);
    this.isAppsMenuOpen.set(false); // Close sidebar
  }

  openShareModal() {
    this.boardMembersModal?.open();
  }

  openMoveTasksModal() {
    this.modalMode.set('MOVE');
    this.modalTitle.set('Mover tareas seleccionadas');
    this.targetBoardId.set(null);
    this.targetColumnId.set(null);
    this.targetBoardColumns.set([]);
    this.isModalOpen.set(true);
  }

  onTargetBoardChange(boardId: string) {
    this.targetBoardId.set(boardId);
    this.targetColumnId.set(null);
    this.taskService.getColumns(boardId).subscribe(cols => {
      this.targetBoardColumns.set(cols.sort((a, b) => a.order - b.order));
    });
  }

  toggleTaskSelection(taskId: string, event: MouseEvent) {
    event.stopPropagation();
    this.selectedTaskIds.update(prev => {
      const next = new Set(prev);
      if (next.has(taskId)) {
        next.delete(taskId);
      } else {
        next.add(taskId);
      }
      return next;
    });
  }

  clearSelection() {
    this.selectedTaskIds.set(new Set());
  }

  confirmAction() {
    if (this.pendingAction) {
      this.pendingAction();
      this.pendingAction = null;
    }
    this.closeModal();
  }

  private openConfirmModal(title: string, message: string, action: () => void) {
    this.confirmTitle.set(title);
    this.confirmMessage.set(message);
    this.pendingAction = action;
    this.modalMode.set('CONFIRM');
    this.isModalOpen.set(true);
  }



  submitModal() {
    const title = this.formTitle();
    // For MOVE mode
    if (this.modalMode() === 'MOVE') {
      this.bulkMoveTasks();
      return;
    }

    if (!title) return;

    if (this.modalMode() === 'BOARD') {
      this.createBoard(title, this.formDescription());
      this.closeModal();
      return;
    }

    const currentBoardId = this.currentBoard()?.id;
    if (!currentBoardId) {
      console.error('No current board selected');
      return;
    }

    if (this.modalMode() === 'LIST') {
      this.addColumn(title, currentBoardId);
    } else if (this.modalMode() === 'CARD') {
      // ... (existing logic)
      if (this.showNewCategoryForm() && this.newCategoryName()) {
        this.taskService.createCategory(this.newCategoryName(), this.newCategoryColor(), currentBoardId).subscribe(newCat => {
          this.categories.update(prev => [...prev, newCat]);
          this.addCard(title, this.formDescription(), newCat.id, this.formEffortPoints(), this.formPriority(), this.formEndDate());
        });
      } else {
        this.addCard(title, this.formDescription(), this.formCategoryId(), this.formEffortPoints(), this.formPriority(), this.formEndDate());
      }
    } else if (this.modalMode() === 'EDIT') {
      // ... (existing logic)
      if (this.showNewCategoryForm() && this.newCategoryName()) {
        this.taskService.createCategory(this.newCategoryName(), this.newCategoryColor(), currentBoardId).subscribe(newCat => {
          this.categories.update(prev => [...prev, newCat]);
          this.editCard(title, this.formDescription(), newCat.id, this.formEffortPoints(), this.formPriority(), this.formEndDate());
        });
      } else {
        this.editCard(title, this.formDescription(), this.formCategoryId(), this.formEffortPoints(), this.formPriority(), this.formEndDate());
      }
    }
    this.closeModal();
  }

  private createBoard(name: string, description: string) {
    this.boardService.createBoard({ name, description }).subscribe({
      next: (newBoard) => {
        this.boards.update(prev => [...prev, newBoard]);
        this.switchBoard(newBoard.id);
        this.notificationService.success('Tablero creado correctamente');
      },
      error: (err) => console.error('Error creating board:', err)
    });
  }

  bulkMoveTasks() {
    const targetBoardId = this.targetBoardId();
    const targetColumnId = this.targetColumnId();
    const taskIds = Array.from(this.selectedTaskIds());

    if (!targetBoardId || !targetColumnId || taskIds.length === 0) return;

    let completed = 0;
    taskIds.forEach(id => {
      this.taskService.moveTask(id, { targetBoardId, targetColumnId }).subscribe({
        next: () => {
          completed++;
          if (completed === taskIds.length) {
            this.closeModal();
            this.clearSelection();
            this.loadBoardData(this.currentBoard()!.id);
          }
        },
        error: (err) => console.error(`Error moving task ${id}:`, err)
      });
    });
  }

  currentTask = signal<Task | null>(null);
  overlayMouseDown = false;

  // Form signals
  formTitle = signal('');
  formDescription = signal('');
  formEmail = signal('');
  formRole = signal<'viewer' | 'editor' | 'owner'>('viewer');
  formCategoryId = signal<string | null>(null);
  formPriority = signal<"Low" | "Medium" | "High">('Low');
  formEndDate = signal<string>('');
  formEffortPoints = signal<number>(0);
  formItems = signal<TaskItem[]>([]);
  showItemsForm = signal(false);
  newItemName = signal('');
  newItemQuantity = signal<number>(1);
  newItemPrice = signal<number>(0);

  // Category creation signals
  showNewCategoryForm = signal(false);
  newCategoryName = signal('');
  newCategoryColor = signal('#0079bf');

  showMenuOptions = signal(false);

  // Drag state
  isDragging = signal(false);

  // Apps Menu state
  isAppsMenuOpen = signal(false);
  isLoading = signal(false);
  dragStartDelay = 0;

  toggleAppsMenu() {
    this.isAppsMenuOpen.update(prev => !prev);
  }

  switchBoard(boardId: string) {
    if (this.currentBoard()?.id === boardId) {
      this.isAppsMenuOpen.set(false);
      return;
    }
    this.loadBoard(boardId);
    this.isAppsMenuOpen.set(false);
  }

  logout() {
    this.authService.logout();
    this.router.navigate(['/login']);
  }

  setPrimaryBoard(event: MouseEvent, boardId: string) {
    event.stopPropagation();
    this.boardService.setPrimaryBoard(boardId).subscribe({
      next: () => {
        // Refresh boards to reflect the new primary status
        this.boardService.getBoards().subscribe(boards => {
          this.boards.set(boards);
        });
      },
      error: (err) => console.error('Error setting primary board:', err)
    });
  }

  deleteBoard(event: MouseEvent, boardId: string) {
    event.stopPropagation();

    const board = this.boards().find(b => b.id === boardId);
    if (!board) return;

    // Prevent deleting the last board
    if (this.boards().length <= 1) {
      this.openConfirmModal('Aviso', 'No puedes eliminar el último tablero.', () => { });
      return;
    }

    this.openConfirmModal(
      'Eliminar tablero',
      `¿Estás seguro de que quieres eliminar el tablero "${board.name}"? Esta acción no se puede deshacer.`,
      () => {
        this.boardService.deleteBoard(boardId).subscribe({
          next: () => {
            this.boards.update(prev => prev.filter(b => b.id !== boardId));
            if (this.currentBoard()?.id === boardId) {
              const primaryBoard = this.boards().find(b => b.isPrimary);
              if (primaryBoard) {
                this.switchBoard(primaryBoard.id);
              } else if (this.boards().length > 0) {
                this.switchBoard(this.boards()[0].id);
              }
            }
            this.isAppsMenuOpen.set(false);
            this.notificationService.success('Tablero eliminado correctamente');
          },
          error: (err) => {
            console.error('Error deleting board:', err);
            this.openConfirmModal('Error', 'Error al eliminar el tablero: ' + (err.error?.message || err.message), () => { });
          }
        });
      }
    );
  }

  ngOnInit() {
    this.loadInitialData();
    this.detectTouchDevice();
  }

  detectTouchDevice() {
    // If touch device, set a delay to allow scrolling without accidentally dragging
    if ('ontouchstart' in window || navigator.maxTouchPoints > 0) {
      this.dragStartDelay = 300; // 300ms long press to start dragging
    }
  }

  ngAfterViewInit() {
    // Reset scroll position to the start (left)
    if (this.boardCanvas?.nativeElement) {
      this.boardCanvas.nativeElement.scrollLeft = 0;
    }
  }

  loadInitialData() {
    this.isLoading.set(true);
    // 1. Load boards and find primary board
    this.boardService.getBoards().subscribe({
      next: (boards) => {
        this.boards.set(boards);
        const primaryBoard = boards.find(b => b.isPrimary) || boards[0];

        if (primaryBoard) {
          this.loadBoard(primaryBoard.id);
        } else {
          this.isLoading.set(false);
        }
      },
      error: (err) => {
        console.error('Error loading boards:', err);
        this.isLoading.set(false);
      }
    });
  }

  loadBoard(boardId: string) {
    this.isLoading.set(true);

    forkJoin({
      board: this.boardService.getBoard(boardId),
      categories: this.taskService.getCategories(boardId),
      columns: this.taskService.getColumns(boardId),
      tasks: this.taskService.getTasks(boardId)
    }).subscribe({
      next: ({ board, categories, columns, tasks }) => {
        this.currentBoard.set(board);
        this.categories.set(categories);
        this.processBoardData(columns, tasks);
        this.isLoading.set(false);
      },
      error: (err) => {
        console.error('Error loading board:', err);
        this.isLoading.set(false);
      }
    });
  }

  loadBoardData(boardId: string) {
    this.isLoading.set(true);

    forkJoin({
      categories: this.taskService.getCategories(boardId),
      columns: this.taskService.getColumns(boardId),
      tasks: this.taskService.getTasks(boardId)
    }).subscribe({
      next: ({ categories, columns, tasks }) => {
        this.categories.set(categories);
        this.processBoardData(columns, tasks);
        this.isLoading.set(false);
      },
      error: (err) => {
        console.error('Error loading board data:', err);
        this.isLoading.set(false);
      }
    });
  }

  private processBoardData(columns: Column[], tasks: Task[]) {
    // Group tasks by columnId
    const sortedColumns = columns.sort((a, b) => a.order - b.order);
    const priorityOrder: Record<string, number> = { 'High': 3, 'Medium': 2, 'Low': 1 };

    const processedColumns = sortedColumns.map(col => {
      const colTasks = tasks.filter(t => t.columnId === col.id);

      // Sort tasks: Priority (High > Medium > Low), then EndDate (Ascending)
      colTasks.sort((a, b) => {
        const pA = priorityOrder[a.priority ?? 'Low'] ?? 1;
        const pB = priorityOrder[b.priority ?? 'Low'] ?? 1;

        if (pA !== pB) return pB - pA; // Descending priority

        // If priorities are equal, sort by endDate (closer dates first)
        const dateA = a.endDate ? new Date(a.endDate).getTime() : Number.MAX_VALUE;
        const dateB = b.endDate ? new Date(b.endDate).getTime() : Number.MAX_VALUE;

        return dateA - dateB;
      });

      return {
        ...col,
        tasks: colTasks
      };
    });

    this.columns.set(processedColumns);
  }

  drop(event: CdkDragDrop<Task[] | undefined>, columnId: string) {
    this.isDragging.set(false);
    this.enableScroll();

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

  onDragStarted() {
    this.isDragging.set(true);
    this.disableScroll();
  }

  onDragEnded() {
    this.isDragging.set(false);
    this.enableScroll();
  }

  isUrgent(endDate?: Date | string): boolean {
    if (!endDate) return false;
    const end = new Date(endDate);
    const now = new Date();
    const diffTime = end.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays >= 0 && diffDays <= 7;
  }


  private disableScroll() {
    if (this.boardCanvas?.nativeElement) {
      this.boardCanvas.nativeElement.style.overflowX = 'hidden';
    }
    document.body.style.overflow = 'hidden';
    document.body.style.touchAction = 'none';
  }

  private enableScroll() {
    if (this.boardCanvas?.nativeElement) {
      this.boardCanvas.nativeElement.style.overflowX = 'auto';
    }
    document.body.style.overflow = '';
    document.body.style.touchAction = '';
  }

  selectCategory(id: string | null) {
    this.selectedCategoryId.set(id);
  }

  getColumnEffortTotal(column: Column): number {
    return (column.tasks || []).reduce((acc, task) => acc + (task.effortPoints || 0), 0);
  }

  getTaskCostTotal(task: Task): number {
    return (task.items || []).reduce((sum, item) => sum + (item.quantity * item.price), 0);
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
    this.currentTask.set(null);
    this.formTitle.set('');
    this.formDescription.set('');
    this.formCategoryId.set(null);
    this.formPriority.set('Low');
    this.formEndDate.set('');
    this.formEffortPoints.set(0);
    this.formItems.set([]);
    this.showItemsForm.set(false);
    this.resetNewItemForm();
    this.showNewCategoryForm.set(false);
    this.isModalOpen.set(true);
  }

  openEditCardModal(task: Task) {
    this.modalMode.set('EDIT');
    this.modalTitle.set('Editar tarjeta');
    this.currentTask.set(task);
    this.currentColumnId.set(task.columnId);
    this.formTitle.set(task.title);
    this.formDescription.set(task.description || '');
    this.formCategoryId.set(task.categoryId || null);
    this.formPriority.set(task.priority || 'Low');
    this.formEndDate.set(task.endDate ? new Date(task.endDate).toISOString().split('T')[0] : '');
    this.formEffortPoints.set(task.effortPoints || 0);
    this.formItems.set(task.items ? [...task.items] : []);
    this.showItemsForm.set(false);
    this.resetNewItemForm();
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

  toggleItemsForm() {
    this.showItemsForm.update(prev => !prev);
    if (!this.showItemsForm()) {
      this.resetNewItemForm();
    }
  }

  addItem() {
    const name = this.newItemName().trim();
    const quantity = this.newItemQuantity();
    const price = this.newItemPrice();

    if (!name || quantity <= 0 || price < 0) return;

    const newItem: TaskItem = { name, quantity, price };
    this.formItems.update(prev => [...prev, newItem]);
    this.resetNewItemForm();
  }

  removeItem(index: number) {
    this.formItems.update(prev => prev.filter((_, i) => i !== index));
  }

  private resetNewItemForm() {
    this.newItemName.set('');
    this.newItemQuantity.set(1);
    this.newItemPrice.set(0);
  }

  openFinancialSummary() {
    this.financialSummary?.open();
    this.showMenuOptions.set(false);
  }

  toggleMenuOptions() {
    this.showMenuOptions.update(prev => !prev);
  }

  // Gantt Chart Methods
  openGanttConfig() {
    this.ganttChart?.openConfig();
    this.showMenuOptions.set(false);
  }



  private addColumn(name: string, boardId: string) {
    this.taskService.createColumn(name, boardId, this.columns().length).subscribe({
      next: (newCol) => {
        this.columns.update(prev => [...prev, { ...newCol, tasks: [] }]);
        this.notificationService.success('Columna añadida correctamente');
      },
      error: (err) => {
        console.error('Error creating column:', err);
      }
    });
  }

  toggleColumnMenu(columnId: string, event: MouseEvent) {
    event.stopPropagation();
    this.activeColumnMenuId.update(prev => prev === columnId ? null : columnId);
  }

  deleteColumn(columnId: string) {
    const column = this.columns().find(c => c.id === columnId);
    if (!column) return;

    this.openConfirmModal(
      'Eliminar columna',
      `¿Estás seguro de que quieres eliminar la columna "${column.name}"? Se perderán todas las tareas que contiene.`,
      () => {
        this.taskService.deleteColumn(columnId).subscribe({
          next: () => {
            this.columns.update(prev => prev.filter(c => c.id !== columnId));
            this.activeColumnMenuId.set(null);
            this.notificationService.success('Columna eliminada correctamente');
          },
          error: (err) => console.error('Error deleting column:', err)
        });
      }
    );
  }

  @HostListener('document:click')
  onDocumentClick() {
    this.activeColumnMenuId.set(null);
  }

  private addCard(title: string, description: string, categoryId: string | null, effortPoints: number, priority: "Low" | "Medium" | "High", endDate: string) {
    const columnId = this.currentColumnId()!;
    this.taskService.createTask({
      title,
      description,
      effortPoints,
      priority,
      endDate: endDate ? new Date(endDate) : undefined,
      categoryId: categoryId || undefined,
      columnId,
      items: this.formItems().length > 0 ? this.formItems() : undefined
    }).subscribe(newTask => {
      // Backend might not return the full category object, let's find it locally
      const category = this.categories().find(c => c.id === categoryId);
      const taskWithCategory = { ...newTask, category };

      this.columns.update(cols => cols.map(c =>
        c.id === columnId ? { ...c, tasks: [...(c.tasks || []), taskWithCategory] } : c
      ));
      this.notificationService.success('Tarjeta añadida correctamente');
    });
  }

  private editCard(title: string, description: string, categoryId: string | null, effortPoints: number, priority: "Low" | "Medium" | "High", endDate: string) {
    const task = this.currentTask();
    if (!task) return;

    this.taskService.updateTask(task.id, {
      title,
      description,
      effortPoints,
      priority,
      endDate: endDate ? new Date(endDate) : undefined,
      categoryId: categoryId || undefined,
      items: this.formItems().length > 0 ? this.formItems() : undefined
    }).subscribe(updatedTask => {
      // Find and update the category object
      const category = this.categories().find(c => c.id === categoryId);
      const taskWithCategory = { ...updatedTask, category };

      this.columns.update(cols => cols.map(c =>
        c.id === task.columnId
          ? {
            ...c,
            tasks: (c.tasks || []).map(t => t.id === task.id ? taskWithCategory : t)
          }
          : c
      ));
      this.notificationService.success('Tarjeta actualizada correctamente');
    });
  }
}
