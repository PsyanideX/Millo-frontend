export interface Category {
  id: string;
  name: string;
  color: string;
}

export interface Column {
  id: string;
  name: string;
  order: number;
  createdAt: Date;
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
  items?: TaskItem[];
  priority?: "Low" | "Medium" | "High";
  endDate?: Date;

  // Relations (optional for frontend display)
  category?: Category;
  column?: Column;
}

// Keep Board for potential future use or if columns need to be grouped, 
// though not mentioned in the current API summary.
export interface Board {
  id: string;
  title: string;
  createdAt: Date;
}