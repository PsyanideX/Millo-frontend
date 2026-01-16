import { Component, computed, inject, OnInit, signal, AfterViewInit, ViewChild, ElementRef } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { CdkDragDrop, DragDropModule, moveItemInArray, transferArrayItem } from '@angular/cdk/drag-drop';
import { FormsModule } from '@angular/forms';
import { forkJoin } from 'rxjs';
import { TaskService } from '../../services/task';
import { BoardService } from '../../services/board';
import { AuthService } from '../../services/auth';
import { Column, Category, Task, TaskItem, Board, BoardMember, GanttTask } from '../../models/task.model';

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
  private router = inject(Router);

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
  isLoading = signal(false);

  // Gantt Chart state
  isGanttConfigOpen = signal(false);
  isGanttChartOpen = signal(false);
  ganttWorkHours = signal<{ [key: string]: number }>({
    monday: 8,
    tuesday: 8,
    wednesday: 8,
    thursday: 8,
    friday: 8,
    saturday: 0,
    sunday: 0
  });
  ganttTasks = signal<GanttTask[]>([]);
  ganttWeeks = signal<number[]>([]);

  weekDays = [
    { key: 'monday', label: 'Lunes', short: 'L' },
    { key: 'tuesday', label: 'Martes', short: 'M' },
    { key: 'wednesday', label: 'Miércoles', short: 'X' },
    { key: 'thursday', label: 'Jueves', short: 'J' },
    { key: 'friday', label: 'Viernes', short: 'V' },
    { key: 'saturday', label: 'Sábado', short: 'S' },
    { key: 'sunday', label: 'Domingo', short: 'D' }
  ];

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
      alert('No puedes eliminar el último tablero.');
      return;
    }

    // Confirm deletion
    if (!confirm(`¿Estás seguro de que quieres eliminar el tablero "${board.name}"? Esta acción no se puede deshacer.`)) {
      return;
    }

    this.boardService.deleteBoard(boardId).subscribe({
      next: () => {
        // Remove board from the list
        this.boards.update(prev => prev.filter(b => b.id !== boardId));

        // If the deleted board was the current board, switch to the primary board
        if (this.currentBoard()?.id === boardId) {
          const primaryBoard = this.boards().find(b => b.isPrimary);
          if (primaryBoard) {
            this.switchBoard(primaryBoard.id);
          } else if (this.boards().length > 0) {
            this.switchBoard(this.boards()[0].id);
          }
        }

        // Close sidebar
        this.isAppsMenuOpen.set(false);
      },
      error: (err) => {
        console.error('Error deleting board:', err);
        alert('Error al eliminar el tablero: ' + (err.error?.message || err.message));
      }
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

  handleFinancialSummaryOverlayClick(event: MouseEvent) {
    if (this.overlayMouseDown && event.target === event.currentTarget) {
      this.closeFinancialSummary();
    }
  }

  handleGanttConfigOverlayClick(event: MouseEvent) {
    if (this.overlayMouseDown && event.target === event.currentTarget) {
      this.closeGanttConfig();
    }
  }

  handleGanttChartOverlayClick(event: MouseEvent) {
    if (this.overlayMouseDown && event.target === event.currentTarget) {
      this.closeGanttChart();
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

  // Gantt Chart Methods
  openGanttConfig() {
    this.isGanttConfigOpen.set(true);
    this.showMenuOptions.set(false);
  }

  closeGanttConfig() {
    this.isGanttConfigOpen.set(false);
  }

  closeGanttChart() {
    this.isGanttChartOpen.set(false);
  }

  updateWorkHours(day: string, hours: number) {
    if (isNaN(hours) || hours < 0) hours = 0;
    if (hours > 24) hours = 24;

    this.ganttWorkHours.update(prev => ({
      ...prev,
      [day]: hours
    }));
  }

  getTotalWeeklyHours(): number {
    const hours = this.ganttWorkHours();
    return Object.values(hours).reduce((sum, h) => sum + h, 0);
  }

  generateGanttChart() {
    const hours = this.ganttWorkHours();
    const hoursPerDay = [
      hours['monday'] || 0,
      hours['tuesday'] || 0,
      hours['wednesday'] || 0,
      hours['thursday'] || 0,
      hours['friday'] || 0,
      hours['saturday'] || 0,
      hours['sunday'] || 0
    ];

    const totalWeeklyHours = hoursPerDay.reduce((a, b) => a + b, 0);
    if (totalWeeklyHours === 0) {
      alert('Debes configurar al menos algunas horas de trabajo por semana.');
      return;
    }

    const allTasks = this.columns().flatMap(col => col.tasks || []);
    if (allTasks.length === 0) {
      this.closeGanttConfig();
      this.isGanttChartOpen.set(true);
      this.ganttTasks.set([]);
      this.ganttWeeks.set([]);
      return;
    }

    // Task Priority Mapping
    const priorityOrder = { 'High': 3, 'Medium': 2, 'Low': 1 };

    // Sort all tasks: Priority Descending, then Title Ascending
    const sortedTasks = [...allTasks].sort((a, b) => {
      const pA = priorityOrder[a.priority ?? 'Low'] ?? 1;
      const pB = priorityOrder[b.priority ?? 'Low'] ?? 1;

      if (pA !== pB) return pB - pA;
      return a.title.localeCompare(b.title);
    });

    const ganttTasks: GanttTask[] = [];
    let currentGlobalHour = 0;

    // Helper to find absolute day index from cumulative work hours
    const findPointInTimeline = (targetHours: number) => {
      if (targetHours <= 0) {
        // Find first working day if target is 0
        let d = 0;
        while (hoursPerDay[d % 7] === 0 && d < 365) d++;
        return d;
      }

      let accumulated = 0;
      let dayIdx = 0;
      while (dayIdx < 3650) { // Safety limit: 10 years
        const hToday = hoursPerDay[dayIdx % 7];
        if (hToday === 0) { // Skip non-working days
          dayIdx++;
          continue;
        }
        if (accumulated + hToday > targetHours) {
          return dayIdx + (targetHours - accumulated) / hToday;
        }
        accumulated += hToday;
        dayIdx++;

        // If we land exactly on the end of a day, skip non-working days to the next working moment
        if (accumulated === targetHours) {
          while (hoursPerDay[dayIdx % 7] === 0 && dayIdx < 3650) {
            dayIdx++;
          }
          return dayIdx;
        }
      }
      return dayIdx;
    };

    sortedTasks.forEach(task => {
      const effort = task.effortPoints || 0;
      const startGlobalHour = currentGlobalHour;

      // We attribute at least a small duration (e.g. 0.5h) to tasks with 0 effort for visibility
      const taskEffort = effort > 0 ? effort : 0.5;
      const endGlobalHour = startGlobalHour + taskEffort;

      const startDay = findPointInTimeline(startGlobalHour);
      const endDay = findPointInTimeline(endGlobalHour);

      ganttTasks.push({
        task,
        startDay,
        duration: Math.max(0.1, endDay - startDay),
        startPercent: 0,
        widthPercent: 0
      });

      currentGlobalHour = endGlobalHour;
    });

    // Determine project duration in weeks
    const maxDay = ganttTasks.length > 0
      ? Math.max(...ganttTasks.map(gt => gt.startDay + gt.duration))
      : 0;

    const weeksNeeded = Math.ceil(maxDay / 7) || 1;
    this.ganttWeeks.set(Array.from({ length: weeksNeeded }, (_, i) => i));

    // Calculate Percentages for CSS visualization
    const projectTotalDays = weeksNeeded * 7;
    ganttTasks.forEach(gt => {
      gt.startPercent = (gt.startDay / projectTotalDays) * 100;
      gt.widthPercent = (gt.duration / projectTotalDays) * 100;
    });

    this.ganttTasks.set(ganttTasks);
    this.closeGanttConfig();
    this.isGanttChartOpen.set(true);
  }

  getTotalEffort(): number {
    return this.ganttTasks().reduce((sum, gt) => sum + (gt.task.effortPoints || 0), 0);
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
