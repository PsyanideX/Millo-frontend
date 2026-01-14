import { Component, computed, inject, OnInit, signal, AfterViewInit, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CdkDragDrop, DragDropModule, moveItemInArray, transferArrayItem } from '@angular/cdk/drag-drop';
import { FormsModule } from '@angular/forms';
import { TaskService } from '../../services/task';
import { BoardService } from '../../services/board';
import { AuthService } from '../../services/auth';
import { Column, Category, Task, TaskItem, Board, BoardMember } from '../../models/task.model';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, DragDropModule, FormsModule],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.scss'
})
export class DashboardComponent implements OnInit, AfterViewInit {
  private taskService = inject(TaskService);
  private boardService = inject(BoardService);
  public authService = inject(AuthService);

  @ViewChild('boardCanvas') boardCanvas?: ElementRef<HTMLDivElement>;

  // Board state
  currentBoard = signal<Board | null>(null);
  boards = signal<Board[]>([]);
  primaryBoardSignal = computed(() => this.boards().find(b => b.isPrimary));
  secondaryBoards = computed(() => this.boards().filter(b => b.ownerId === this.authService.currentUser()?.id && !b.isPrimary));
  sharedBoards = computed(() => this.boards().filter(b => !b.isPrimary && b.ownerId !== this.authService.currentUser()?.id));

  // Board structure (now based on Columns as per API)
  columns = signal<Column[]>([]);
  categories = signal<Category[]>([]);
  boardMembers = signal<BoardMember[]>([]);
  selectedCategoryId = signal<string | null>(null);

  columnIds = computed(() => this.columns().map(c => c.id));

  itemsTotal = computed(() => {
    return this.formItems().reduce((sum, item) => sum + (item.quantity * item.price), 0);
  });

  // Modal state
  isModalOpen = signal(false);
  modalMode = signal<'LIST' | 'CARD' | 'EDIT' | 'BOARD' | 'SHARE' | 'MOVE'>('CARD');
  modalTitle = signal('');
  currentColumnId = signal<string | null>(null);

  // Bulk Move state
  selectedTaskIds = signal<Set<string>>(new Set());
  targetBoardId = signal<string | null>(null);
  targetColumnId = signal<string | null>(null);
  targetBoardColumns = signal<Column[]>([]);



  openAddBoardModal() {
    this.modalMode.set('BOARD');
    this.modalTitle.set('Crear nuevo tablero');
    this.formTitle.set('');
    this.formDescription.set('');
    this.isModalOpen.set(true);
    this.isAppsMenuOpen.set(false); // Close sidebar
  }

  openShareModal() {
    this.modalMode.set('SHARE');
    this.modalTitle.set('Gestionar Miembros');
    this.formEmail.set('');
    this.formRole.set('viewer');
    this.loadBoardMembers();
    this.isModalOpen.set(true);
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

  loadBoardMembers() {
    const boardId = this.currentBoard()?.id;
    if (!boardId) return;
    this.boardService.getBoardMembers(boardId).subscribe({
      next: (members) => this.boardMembers.set(members),
      error: (err) => console.error('Error loading members:', err)
    });
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
      },
      error: (err) => console.error('Error creating board:', err)
    });
  }

  public shareBoard() {
    const boardId = this.currentBoard()?.id;
    const email = this.formEmail();
    const role = this.formRole();

    if (!boardId || !email) return;

    this.boardService.addMember(boardId, { email, role }).subscribe({
      next: (member) => {
        this.boardMembers.update(prev => [...prev, member]);
        this.formEmail.set('');
      },
      error: (err) => {
        console.error('Error adding member:', err);
        alert('Error al añadir miembro: ' + (err.error?.message || err.message));
      }
    });
  }

  removeMember(memberId: string) {
    const boardId = this.currentBoard()?.id;
    if (!boardId) return;

    if (!confirm('¿Estás seguro de que quieres eliminar a este miembro?')) return;

    this.boardService.deleteMember(boardId, memberId).subscribe({
      next: () => {
        this.boardMembers.update(prev => prev.filter(m => m.id !== memberId));
      },
      error: (err) => console.error('Error removing member:', err)
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

  // Financial summary modal signals
  isFinancialSummaryOpen = signal(false);
  summarySelectedCategoryId = signal<string | null>(null);
  showMenuOptions = signal(false);

  // Drag state
  isDragging = signal(false);

  // Apps Menu state
  isAppsMenuOpen = signal(false);

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
    // 1. Load boards and find primary board
    this.boardService.getBoards().subscribe({
      next: (boards) => {
        this.boards.set(boards);
        const primaryBoard = boards.find(b => b.isPrimary) || boards[0];

        if (primaryBoard) {
          this.loadBoard(primaryBoard.id);
        }
      },
      error: (err) => {
        console.error('Error loading boards:', err);
      }
    });
  }

  loadBoard(boardId: string) {
    // 1. Load board details
    this.boardService.getBoard(boardId).subscribe({
      next: (board) => {
        this.currentBoard.set(board);
        this.loadBoardData(boardId);
      },
      error: (err) => {
        console.error('Error loading board:', err);
      }
    });
  }

  loadBoardData(boardId: string) {
    // 1. Load Categories for this board
    this.taskService.getCategories(boardId).subscribe({
      next: (data) => {
        this.categories.set(data);
      },
      error: (err) => {
        console.error('Error loading categories:', err);
      }
    });

    // 2. Load Columns for this board
    this.taskService.getColumns(boardId).subscribe({
      next: (columns) => {
        this.columns.set(columns.sort((a, b) => a.order - b.order));
        this.loadTasksForAllColumns(boardId);
      },
      error: (err) => {
        console.error('Error loading columns:', err);
        this.columns.set([]);
      }
    });
  }

  loadTasksForAllColumns(boardId: string) {
    this.taskService.getTasks(boardId).subscribe({
      next: (tasks) => {
        // Group tasks by columnId
        this.columns.update(cols => cols.map(col => {
          const colTasks = tasks.filter(t => t.columnId === col.id);

          // Sort tasks: Priority (High > Medium > Low), then EndDate (Ascending)
          const priorityOrder = { 'High': 3, 'Medium': 2, 'Low': 1 };

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
        }));
      },
      error: (err) => {
        console.error('Error loading tasks:', err);
      }
    });
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
    this.isFinancialSummaryOpen.set(true);
    this.summarySelectedCategoryId.set(null);
    this.showMenuOptions.set(false);
  }

  closeFinancialSummary() {
    this.isFinancialSummaryOpen.set(false);
  }

  toggleMenuOptions() {
    this.showMenuOptions.update(prev => !prev);
  }

  getFinancialSummary(categoryId: string | null): { items: Array<{ name: string; quantity: number; price: number; subtotal: number }>; total: number } {
    const allTasks = this.columns().flatMap(col => col.tasks || []);

    let filteredTasks = allTasks;
    if (categoryId) {
      filteredTasks = allTasks.filter(task => task.categoryId === categoryId);
    }

    const itemsMap = new Map<string, { quantity: number; price: number }>();

    filteredTasks.forEach(task => {
      (task.items || []).forEach(item => {
        const existing = itemsMap.get(item.name) || { quantity: 0, price: item.price };
        itemsMap.set(item.name, {
          quantity: existing.quantity + item.quantity,
          price: item.price
        });
      });
    });

    const items = Array.from(itemsMap.entries()).map(([name, data]) => ({
      name,
      quantity: data.quantity,
      price: data.price,
      subtotal: data.quantity * data.price
    }));

    const total = items.reduce((sum, item) => sum + item.subtotal, 0);

    return { items, total };
  }



  private addColumn(name: string, boardId: string) {
    this.taskService.createColumn(name, boardId, this.columns().length).subscribe({
      next: (newCol) => {
        this.columns.update(prev => [...prev, { ...newCol, tasks: [] }]);
      },
      error: (err) => {
        console.error('Error creating column:', err);
      }
    });
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
    });
  }
}
