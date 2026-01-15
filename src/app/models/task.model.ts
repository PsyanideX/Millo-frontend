export interface Category {
  id: string;
  name: string;
  color: string;
  boardId: string;
  board?: Board; // Optional relation
}

export interface Column {
  id: string;
  name: string;
  order: number;
  boardId: string;
  createdAt: Date;
  board?: Board; // Optional relation
  tasks?: Task[]; // Optional array for frontend grouping
}

export interface TaskItem {
  name: string;
  quantity: number;
  price: number;
}

export interface Task {
  id: string;
  title: string;
  description?: string;
  effortPoints: number;
  createdAt: Date;
  categoryId?: string;
  columnId: string;
  boardId: string; // Board ID (obtained from column)
  items?: TaskItem[];
  priority?: "Low" | "Medium" | "High";
  endDate?: Date;

  // Relations (optional for frontend display)
  category?: Category;
  column?: Column;
}

export interface User {
  id: string;
  email: string;
  name: string;
}

export interface Board {
  id: string;
  name: string;
  description?: string;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
  owner: User;
  role?: "owner" | "editor" | "viewer"; // Only in listing
  isPrimary?: boolean; // Only in listing
  _count?: {
    members: number;
    columns: number;
    tasks: number;
  };
}

export interface BoardMember {
  id: string;
  role: "owner" | "editor" | "viewer";
  isPrimary: boolean;
  userId: string;
  boardId: string;
  user: User;
}

export interface GanttTask {
  task: Task;
  startDay: number;
  duration: number;
  startPercent: number;
  widthPercent: number;
}