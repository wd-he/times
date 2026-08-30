package model

type User struct {
	ID          int64  `json:"id"`
	Username    string `json:"username"`
	DisplayName string `json:"display_name"`
	Role        string `json:"role"`
	Enabled     bool   `json:"enabled"`
	CreatedAt   string `json:"created_at"`
	UpdatedAt   string `json:"updated_at"`
}

type Category struct {
	ID        int64  `json:"id"`
	UserID    int64  `json:"user_id"`
	Name      string `json:"name"`
	Kind      string `json:"kind"`
	ParentID  *int64 `json:"parent_id,omitempty"`
	CreatedAt string `json:"created_at"`
	UpdatedAt string `json:"updated_at"`
}

type AdminCategory struct {
	Category
	UserDisplayName string `json:"user_display_name"`
	UserUsername    string `json:"user_username"`
	EventCount      int    `json:"event_count"`
}

type Event struct {
	ID              int64  `json:"id"`
	UserID          int64  `json:"user_id"`
	UserName        string `json:"user_name,omitempty"`
	MajorCategoryID int64  `json:"major_category_id"`
	MajorCategory   string `json:"major_category"`
	SubCategoryID   *int64 `json:"sub_category_id,omitempty"`
	SubCategory     string `json:"sub_category,omitempty"`
	Description     string `json:"description"`
	StartedAt       string `json:"started_at"`
	CompletedAt     string `json:"completed_at"`
	DurationSeconds int64  `json:"duration_seconds"`
	CreatedAt       string `json:"created_at"`
	UpdatedAt       string `json:"updated_at"`
}

type StatisticPoint struct {
	Date            string `json:"date,omitempty"`
	MajorCategory   string `json:"major_category"`
	UserID          int64  `json:"user_id,omitempty"`
	UserName        string `json:"user_name,omitempty"`
	DurationSeconds int64  `json:"duration_seconds"`
}
