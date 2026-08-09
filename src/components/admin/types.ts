export interface LandingPageImage {
  id: string;
  title: string;
  description: string;
  file_name: string;
  original_name: string;
  mime_type: string;
  file_size: number;
  width: number;
  height: number;
  storage_path: string;
  thumbnail_path: string;
  mobile_path: string;
  desktop_path: string;
  alt_text: string;
  seo_title: string;
  seo_description: string;
  status: string;
  version: number;
  uploaded_by: string;
  created_at: string;
  updated_at: string;
  deleted_at?: string;
  published_at?: string;
  expires_at?: string;
  thumbnail_url?: string;
  mobile_url?: string;
  desktop_url?: string;
}

export interface ImageVersion {
  id: string;
  image_id: string;
  version: number;
  file_name: string;
  original_name: string;
  mime_type: string;
  file_size: number;
  width: number;
  height: number;
  storage_path: string;
  thumbnail_path: string;
  mobile_path: string;
  desktop_path: string;
  alt_text: string;
  seo_title: string;
  seo_description: string;
  change_summary?: string;
  created_by: string;
  created_at: string;
}