export interface NotebookCell {
  cell_type: 'markdown' | 'code';
  source: string[];
  metadata: Record<string, any>;
  outputs?: any[];
  execution_count?: number | null;
}

export interface Notebook {
  cells: NotebookCell[];
  metadata: Record<string, any>;
  nbformat: number;
  nbformat_minor: number;
}

export interface DayContent {
  id: string;
  title: string;
  cells: NotebookCell[];
}

export interface Group {
  id: string;
  name: string;
  createdAt: any;
}

export interface Exercise {
  id: string;
  title: string;
  description: string;
  solution_hint: string;
  completed: boolean;
  userCode?: string;
  output?: string;
  error?: string;
}

export interface ApplicationState {
  notebook: Notebook | null;
  days: DayContent[];
  selectedDayId: string | null;
  exercises: Record<string, Exercise[]>; // dayId -> exercises
  isLoading: boolean;
}
