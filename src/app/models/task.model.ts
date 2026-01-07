export interface Category {
  id: string;
  name: string;
  color: string;
}

export interface Task {
  id: string;
  title: string;
  description?: string;
  effortPoints: number;
  status: 'PENDING' | 'IN_PROGRESS' | 'DONE';
  categoryId?: string;
  category?: Category;
  createdAt: Date;
}