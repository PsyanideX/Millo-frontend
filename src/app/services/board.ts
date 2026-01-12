import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { Board, BoardMember } from '../models/task.model';

export interface CreateBoardRequest {
  name: string;
  description?: string;
}

export interface UpdateBoardRequest {
  name?: string;
  description?: string;
}

export interface AddMemberRequest {
  email: string;
  role?: "viewer" | "editor" | "owner";
}

export interface UpdateMemberRequest {
  role: "viewer" | "editor" | "owner";
}

@Injectable({
  providedIn: 'root'
})
export class BoardService {
  private http = inject(HttpClient);
  private apiUrl = environment.vercelUrl;

  // Boards
  getBoards(): Observable<Board[]> {
    return this.http.get<Board[]>(`${this.apiUrl}/boards`);
  }

  getBoard(id: string): Observable<Board> {
    return this.http.get<Board>(`${this.apiUrl}/boards/${id}`);
  }

  createBoard(data: CreateBoardRequest): Observable<Board> {
    return this.http.post<Board>(`${this.apiUrl}/boards`, data);
  }

  updateBoard(id: string, data: UpdateBoardRequest): Observable<Board> {
    return this.http.patch<Board>(`${this.apiUrl}/boards/${id}`, data);
  }

  deleteBoard(id: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/boards/${id}`);
  }

  setPrimaryBoard(id: string): Observable<void> {
    return this.http.post<void>(`${this.apiUrl}/boards/${id}/set-primary`, {});
  }

  // Members
  getBoardMembers(boardId: string): Observable<BoardMember[]> {
    return this.http.get<BoardMember[]>(`${this.apiUrl}/boards/${boardId}/members`);
  }

  addMember(boardId: string, data: AddMemberRequest): Observable<BoardMember> {
    return this.http.post<BoardMember>(`${this.apiUrl}/boards/${boardId}/members`, data);
  }

  updateMember(boardId: string, memberId: string, data: UpdateMemberRequest): Observable<BoardMember> {
    return this.http.patch<BoardMember>(`${this.apiUrl}/boards/${boardId}/members/${memberId}`, data);
  }

  deleteMember(boardId: string, memberId: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/boards/${boardId}/members/${memberId}`);
  }
}
