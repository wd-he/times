package store

import (
	"database/sql"
	"times/internal/model"
)

func (store *Store) CreateEvent(event model.Event) (model.Event, error) {
	result, err := store.db.Exec(`INSERT INTO events(user_id, major_category_id, sub_category_id, description, started_at, completed_at, duration_seconds, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, event.UserID, event.MajorCategoryID, event.SubCategoryID, event.Description, event.StartedAt, event.CompletedAt, event.DurationSeconds, event.CreatedAt, event.UpdatedAt)
	if err != nil {
		return model.Event{}, err
	}
	event.ID, err = result.LastInsertId()
	if err != nil {
		return model.Event{}, err
	}
	return store.GetEvent(event.ID)
}

func (store *Store) GetEvent(id int64) (model.Event, error) {
	return store.queryOneEvent("WHERE e.id = ?", id)
}

func (store *Store) ListEvents(userID int64, from, to string) ([]model.Event, error) {
	condition := "WHERE e.user_id = ?"
	args := []any{userID}
	if from != "" {
		condition += " AND datetime(e.started_at) >= datetime(?)"
		args = append(args, from)
	}
	if to != "" {
		condition += " AND datetime(e.started_at) < datetime(?)"
		args = append(args, to)
	}
	rows, err := store.db.Query(`SELECT e.id, e.user_id, u.display_name, e.major_category_id, major.name, e.sub_category_id, sub.name, e.description, e.started_at, e.completed_at, e.duration_seconds, e.created_at, e.updated_at FROM events e JOIN users u ON u.id = e.user_id JOIN categories major ON major.id = e.major_category_id LEFT JOIN categories sub ON sub.id = e.sub_category_id `+condition+` ORDER BY datetime(e.started_at) DESC`, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	events := make([]model.Event, 0)
	for rows.Next() {
		event, err := scanEvent(rows)
		if err != nil {
			return nil, err
		}
		events = append(events, event)
	}
	return events, rows.Err()
}

func (store *Store) UpdateEvent(event model.Event) (bool, error) {
	result, err := store.db.Exec(`UPDATE events SET major_category_id = ?, sub_category_id = ?, description = ?, started_at = ?, completed_at = ?, duration_seconds = ?, updated_at = ? WHERE id = ? AND user_id = ?`, event.MajorCategoryID, event.SubCategoryID, event.Description, event.StartedAt, event.CompletedAt, event.DurationSeconds, event.UpdatedAt, event.ID, event.UserID)
	return affected(result, err)
}

func (store *Store) DeleteEvent(id, userID int64) (bool, error) {
	result, err := store.db.Exec("DELETE FROM events WHERE id = ? AND user_id = ?", id, userID)
	return affected(result, err)
}

func (store *Store) queryOneEvent(condition string, args ...any) (model.Event, error) {
	row := store.db.QueryRow(`SELECT e.id, e.user_id, u.display_name, e.major_category_id, major.name, e.sub_category_id, sub.name, e.description, e.started_at, e.completed_at, e.duration_seconds, e.created_at, e.updated_at FROM events e JOIN users u ON u.id = e.user_id JOIN categories major ON major.id = e.major_category_id LEFT JOIN categories sub ON sub.id = e.sub_category_id `+condition, args...)
	return scanEvent(row)
}

type scanner interface{ Scan(dest ...any) error }

func scanEvent(row scanner) (model.Event, error) {
	var event model.Event
	var subID sql.NullInt64
	var subName sql.NullString
	err := row.Scan(&event.ID, &event.UserID, &event.UserName, &event.MajorCategoryID, &event.MajorCategory, &subID, &subName, &event.Description, &event.StartedAt, &event.CompletedAt, &event.DurationSeconds, &event.CreatedAt, &event.UpdatedAt)
	if err != nil {
		return model.Event{}, err
	}
	if subID.Valid {
		event.SubCategoryID = &subID.Int64
	}
	if subName.Valid {
		event.SubCategory = subName.String
	}
	return event, nil
}
