import { Component, input, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Column, Category } from '../../../models/task.model';

@Component({
  selector: 'app-financial-summary',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './financial-summary.component.html',
  styleUrl: './financial-summary.component.scss'
})
export class FinancialSummaryComponent {
  columns = input.required<Column[]>();
  categories = input.required<Category[]>();
  
  isOpen = signal(false);
  selectedCategoryId = signal<string | null>(null);
  overlayMouseDown = false;

  open() {
    this.isOpen.set(true);
    this.selectedCategoryId.set(null);
  }

  close() {
    this.isOpen.set(false);
  }

  handleOverlayMouseDown(event: MouseEvent) {
    this.overlayMouseDown = event.target === event.currentTarget;
  }

  handleOverlayClick(event: MouseEvent) {
    if (this.overlayMouseDown && event.target === event.currentTarget) {
      this.close();
    }
  }

  summaryData = computed(() => {
    const categoryId = this.selectedCategoryId();
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
  });

  setSelectedCategory(id: string | null) {
      this.selectedCategoryId.set(id);
  }
}
