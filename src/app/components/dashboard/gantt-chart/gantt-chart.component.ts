import { Component, input, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Column, Task, GanttTask } from '../../../models/task.model';

@Component({
  selector: 'app-gantt-chart',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './gantt-chart.component.html',
  styleUrl: './gantt-chart.component.scss'
})
export class GanttChartComponent {
  columns = input<Column[]>([]);
  boardName = input<string>('');

  isConfigOpen = signal(false);
  isChartOpen = signal(false);
  
  workHours = signal<{ [key: string]: number }>({
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

  overlayMouseDown = false;

  openConfig() {
    this.isConfigOpen.set(true);
  }

  closeConfig() {
    this.isConfigOpen.set(false);
  }

  closeChart() {
    this.isChartOpen.set(false);
  }

  updateWorkHours(day: string, hours: number) {
    if (isNaN(hours) || hours < 0) hours = 0;
    if (hours > 24) hours = 24;

    this.workHours.update(prev => ({
      ...prev,
      [day]: hours
    }));
  }

  getTotalWeeklyHours(): number {
    const hours = this.workHours();
    return Object.values(hours).reduce((sum, h) => sum + h, 0);
  }

  handleOverlayMouseDown(event: MouseEvent) {
    this.overlayMouseDown = event.target === event.currentTarget;
  }

  handleGanttConfigOverlayClick(event: MouseEvent) {
    if (this.overlayMouseDown && event.target === event.currentTarget) {
      this.closeConfig();
    }
  }

  handleGanttChartOverlayClick(event: MouseEvent) {
    if (this.overlayMouseDown && event.target === event.currentTarget) {
      this.closeChart();
    }
  }

  generateGanttChart() {
    const hours = this.workHours();
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
      this.closeConfig();
      this.isChartOpen.set(true);
      this.ganttTasks.set([]);
      this.ganttWeeks.set([]);
      return;
    }

    const priorityOrder: Record<string, number> = { 'High': 3, 'Medium': 2, 'Low': 1 };

    const sortedTasks = [...allTasks].sort((a, b) => {
      const pA = priorityOrder[a.priority ?? 'Low'] ?? 1;
      const pB = priorityOrder[b.priority ?? 'Low'] ?? 1;

      if (pA !== pB) return pB - pA;
      return a.title.localeCompare(b.title);
    });

    const ganttTasks: GanttTask[] = [];
    let currentGlobalHour = 0;

    const findPointInTimeline = (targetHours: number) => {
      if (targetHours <= 0) {
        let d = 0;
        while (hoursPerDay[d % 7] === 0 && d < 365) d++;
        return d;
      }

      let accumulated = 0;
      let dayIdx = 0;
      while (dayIdx < 3650) {
        const hToday = hoursPerDay[dayIdx % 7];
        if (hToday === 0) {
          dayIdx++;
          continue;
        }
        if (accumulated + hToday > targetHours) {
          return dayIdx + (targetHours - accumulated) / hToday;
        }
        accumulated += hToday;
        dayIdx++;

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

    const maxDay = ganttTasks.length > 0
      ? Math.max(...ganttTasks.map(gt => gt.startDay + gt.duration))
      : 0;

    const weeksNeeded = Math.ceil(maxDay / 7) || 1;
    this.ganttWeeks.set(Array.from({ length: weeksNeeded }, (_, i) => i));

    const projectTotalDays = weeksNeeded * 7;
    ganttTasks.forEach(gt => {
      gt.startPercent = (gt.startDay / projectTotalDays) * 100;
      gt.widthPercent = (gt.duration / projectTotalDays) * 100;
    });

    this.ganttTasks.set(ganttTasks);
    this.closeConfig();
    this.isChartOpen.set(true);
  }

  getTotalEffort(): number {
    return this.ganttTasks().reduce((sum, gt) => sum + (gt.task.effortPoints || 0), 0);
  }
}
