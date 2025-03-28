
export interface Submission {
  id: number;
  email: string;
  country: string;
  file_path: string;
  file_name: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  submitted_at: string;
  created_at: string;
}

export type SubmissionInsert = Omit<Submission, 'id' | 'created_at'>;
