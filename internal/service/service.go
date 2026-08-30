package service

import (
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/base64"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"time"

	"times/internal/config"
	"times/internal/model"
	"times/internal/store"
)

var (
	ErrUnauthorized = errors.New("未授权")
	ErrForbidden    = errors.New("没有权限")
	ErrNotFound     = errors.New("资源不存在")
	ErrInvalid      = errors.New("输入无效")
	ErrConflict     = errors.New("资源冲突")
)

type Service struct {
	store  *store.Store
	config config.Config
}

const maxCategoryNameLength = 20

type EventInput struct {
	MajorCategoryID int64  `json:"major_category_id"`
	SubCategoryID   *int64 `json:"sub_category_id"`
	Description     string `json:"description"`
	StartedAt       string `json:"started_at"`
	CompletedAt     string `json:"completed_at"`
}

type ImportEventInput struct {
	MajorCategory string
	SubCategory   string
	Description   string
	StartedAt     string
	CompletedAt   string
}

type CategoryInput struct {
	Name     string `json:"name"`
	Kind     string `json:"kind"`
	ParentID *int64 `json:"parent_id"`
}

type UserInput struct {
	Username    string `json:"username"`
	DisplayName string `json:"display_name"`
	Enabled     *bool  `json:"enabled"`
}

type TokenInput struct {
	TokenSuffix string `json:"token_suffix"`
}

var usernamePattern = regexp.MustCompile(`^[A-Za-z]+$`)
var tokenSuffixPattern = regexp.MustCompile(`^[A-Za-z0-9_-]+$`)

func New(database *store.Store, cfg config.Config) *Service {
	return &Service{store: database, config: cfg}
}

func (service *Service) Initialize() error {
	_, err := service.store.Admin()
	if err == nil {
		if _, statErr := os.Stat(service.config.AdminTokenPath); statErr != nil {
			return fmt.Errorf("管理员 token 文件不存在，请执行管理员 token 重置：%w", statErr)
		}
		return nil
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return fmt.Errorf("读取管理员失败：%w", err)
	}
	token, hash, err := generateToken("admin", "")
	if err != nil {
		return err
	}
	if err := service.store.CreateAdmin(hash, now()); err != nil {
		return fmt.Errorf("创建管理员失败：%w", err)
	}
	if err := service.writeAdminToken(token); err != nil {
		return fmt.Errorf("写入管理员 token 失败：%w", err)
	}
	return nil
}

func (service *Service) Authenticate(token string) (model.User, error) {
	if strings.TrimSpace(token) == "" {
		return model.User{}, ErrUnauthorized
	}
	user, err := service.store.FindUserByTokenHash(hashToken(token))
	if err != nil {
		return model.User{}, ErrUnauthorized
	}
	return user, nil
}

func (service *Service) ResetToken(userID int64, admin bool, customSuffix string) (string, error) {
	user, err := service.store.GetUser(userID)
	if err != nil {
		return "", ErrNotFound
	}
	token, hash, err := generateToken(user.Username, customSuffix)
	if err != nil {
		return "", err
	}
	ok, err := service.store.UpdateToken(userID, hash, now())
	if err != nil {
		return "", err
	}
	if !ok {
		return "", ErrNotFound
	}
	if admin {
		if err := service.writeAdminToken(token); err != nil {
			return "", err
		}
	}
	return token, nil
}

func (service *Service) ListUsers() ([]model.User, error) { return service.store.ListUsers() }

func (service *Service) CreateUser(input UserInput) (model.User, string, error) {
	username := strings.TrimSpace(input.Username)
	displayName := strings.TrimSpace(input.DisplayName)
	if !usernamePattern.MatchString(username) || len(username) > 32 {
		return model.User{}, "", fmt.Errorf("%w：username 只能使用英文字母且不能超过 32 个字符", ErrInvalid)
	}
	if displayName == "" || len([]rune(displayName)) > 80 {
		return model.User{}, "", fmt.Errorf("%w：displayName 不能为空且不能超过 80 个字符", ErrInvalid)
	}
	exists, err := service.store.UsernameExists(username)
	if err != nil {
		return model.User{}, "", err
	}
	if exists {
		return model.User{}, "", fmt.Errorf("%w：username 已存在", ErrConflict)
	}
	token, hash, err := generateToken(username, "")
	if err != nil {
		return model.User{}, "", err
	}
	user, err := service.store.CreateUser(username, displayName, hash, now())
	return user, token, err
}

func (service *Service) UpdateUser(id int64, input UserInput) error {
	if input.DisplayName == "" && input.Enabled == nil {
		return fmt.Errorf("%w：没有可更新的内容", ErrInvalid)
	}
	var displayName *string
	if input.DisplayName != "" {
		trimmed := strings.TrimSpace(input.DisplayName)
		if len([]rune(trimmed)) > 80 {
			return fmt.Errorf("%w：displayName 不能超过 80 个字符", ErrInvalid)
		}
		displayName = &trimmed
	}
	ok, err := service.store.UpdateUser(id, displayName, input.Enabled, now())
	if err != nil {
		return err
	}
	if !ok {
		return ErrNotFound
	}
	if input.Enabled != nil && !*input.Enabled {
		return service.store.DisableToken(id, now())
	}
	return nil
}

func (service *Service) Categories(userID int64) ([]model.Category, error) {
	return service.store.ListCategories(userID)
}

func (service *Service) AdminCategories() ([]model.AdminCategory, error) {
	return service.store.ListAllCategories()
}

func (service *Service) DeleteCategory(id int64) error {
	ok, err := service.store.DeleteCategory(id)
	if err != nil {
		return err
	}
	if ok {
		return nil
	}
	exists, err := service.store.CategoryExists(id)
	if err != nil {
		return err
	}
	if !exists {
		return ErrNotFound
	}
	return ErrConflict
}

func (service *Service) ClearUnusedCategories() (int, error) {
	return service.store.ClearUnusedCategories()
}

func (service *Service) CreateCategory(userID int64, input CategoryInput) (model.Category, bool, error) {
	name := strings.TrimSpace(input.Name)
	if name == "" || len([]rune(name)) > maxCategoryNameLength || (input.Kind != "major" && input.Kind != "sub") {
		return model.Category{}, false, fmt.Errorf("%w：分类名称不能为空且不能超过 20 个字符，分类类型必须有效", ErrInvalid)
	}
	if input.Kind == "major" {
		input.ParentID = nil
	}
	if input.Kind == "sub" {
		if input.ParentID == nil {
			return model.Category{}, false, fmt.Errorf("%w：细分类型必须属于当前用户的大类", ErrInvalid)
		}
		belongs, err := service.store.CategoryBelongs(*input.ParentID, "major", nil)
		if err != nil || !belongs {
			return model.Category{}, false, fmt.Errorf("%w：细分类型所属大类无效", ErrInvalid)
		}
	}
	if existing, err := service.store.FindCategory(name, input.Kind, input.ParentID); err == nil {
		return existing, true, nil
	}
	category, err := service.store.CreateCategory(userID, name, input.Kind, input.ParentID, now())
	return category, false, err
}

func (service *Service) ValidateEvent(userID int64, input EventInput) (time.Time, time.Time, int64, error) {
	if input.MajorCategoryID <= 0 || input.SubCategoryID == nil || strings.TrimSpace(input.Description) == "" || len([]rune(input.Description)) > 2000 {
		return time.Time{}, time.Time{}, 0, fmt.Errorf("%w：事件大类、细分类型和描述不能为空，描述不能超过 2000 个字符", ErrInvalid)
	}
	belongs, err := service.store.CategoryBelongs(input.MajorCategoryID, "major", nil)
	if err != nil || !belongs {
		return time.Time{}, time.Time{}, 0, fmt.Errorf("%w：事件大类无效", ErrInvalid)
	}
	belongs, err = service.store.CategoryBelongs(*input.SubCategoryID, "sub", &input.MajorCategoryID)
	if err != nil || !belongs {
		return time.Time{}, time.Time{}, 0, fmt.Errorf("%w：细分类型无效", ErrInvalid)
	}
	started, err := parseEventTime(input.StartedAt)
	if err != nil {
		return time.Time{}, time.Time{}, 0, fmt.Errorf("%w：开始时间格式无效", ErrInvalid)
	}
	completed, err := parseEventTime(input.CompletedAt)
	if err != nil {
		return time.Time{}, time.Time{}, 0, fmt.Errorf("%w：完成时间格式无效", ErrInvalid)
	}
	duration := int64(completed.Sub(started).Seconds())
	if duration <= 0 {
		return time.Time{}, time.Time{}, 0, fmt.Errorf("%w：完成时间必须晚于开始时间", ErrInvalid)
	}
	return started, completed, duration, nil
}

func parseEventTime(value string) (time.Time, error) {
	parsed, err := time.Parse(time.RFC3339, value)
	if err == nil {
		return parsed, nil
	}
	trimmed := strings.TrimSpace(value)
	var lastErr error
	for _, layout := range []string{"2006-01-02 15:04", "2006-01-02 15:04:05"} {
		parsed, parseErr := time.ParseInLocation(layout, trimmed, time.FixedZone("UTC+8", 8*60*60))
		if parseErr == nil {
			return parsed, nil
		}
		lastErr = parseErr
	}
	return time.Time{}, lastErr
}

func formatStoredTime(value time.Time) string {
	return value.UTC().Format(time.RFC3339)
}

func (service *Service) CreateEvent(userID int64, input EventInput) (model.Event, error) {
	started, completed, duration, err := service.ValidateEvent(userID, input)
	if err != nil {
		return model.Event{}, err
	}
	event := model.Event{UserID: userID, MajorCategoryID: input.MajorCategoryID, SubCategoryID: input.SubCategoryID, Description: strings.TrimSpace(input.Description), StartedAt: formatStoredTime(started), CompletedAt: formatStoredTime(completed), DurationSeconds: duration, CreatedAt: now(), UpdatedAt: now()}
	return service.store.CreateEvent(event)
}

func (service *Service) ImportEvents(userID int64, inputs []ImportEventInput) (int, error) {
	majorIDs := make(map[string]int64)
	subIDs := make(map[string]int64)
	imported := 0
	for index, input := range inputs {
		majorName := strings.TrimSpace(input.MajorCategory)
		if majorName == "" {
			return imported, fmt.Errorf("第 %d 条记录：事件大类不能为空", index+1)
		}
		majorID, exists := majorIDs[majorName]
		if !exists {
			category, _, err := service.CreateCategory(userID, CategoryInput{Name: majorName, Kind: "major"})
			if err != nil {
				return imported, fmt.Errorf("第 %d 条记录：%w", index+1, err)
			}
			majorID = category.ID
			majorIDs[majorName] = majorID
		}

		var subID *int64
		subName := strings.TrimSpace(input.SubCategory)
		if subName == "" {
			return imported, fmt.Errorf("第 %d 条记录：细分类型不能为空", index+1)
		}
		subKey := majorName + "\x00" + subName
		resolvedID, subExists := subIDs[subKey]
		if !subExists {
			category, _, err := service.CreateCategory(userID, CategoryInput{Name: subName, Kind: "sub", ParentID: &majorID})
			if err != nil {
				return imported, fmt.Errorf("第 %d 条记录：%w", index+1, err)
			}
			resolvedID = category.ID
			subIDs[subKey] = resolvedID
		}
		subID = &resolvedID

		_, err := service.CreateEvent(userID, EventInput{MajorCategoryID: majorID, SubCategoryID: subID, Description: input.Description, StartedAt: input.StartedAt, CompletedAt: input.CompletedAt})
		if err != nil {
			return imported, fmt.Errorf("第 %d 条记录：%w", index+1, err)
		}
		imported++
	}
	return imported, nil
}

func (service *Service) UpdateEvent(userID, id int64, input EventInput) (model.Event, error) {
	started, completed, duration, err := service.ValidateEvent(userID, input)
	if err != nil {
		return model.Event{}, err
	}
	event := model.Event{ID: id, UserID: userID, MajorCategoryID: input.MajorCategoryID, SubCategoryID: input.SubCategoryID, Description: strings.TrimSpace(input.Description), StartedAt: formatStoredTime(started), CompletedAt: formatStoredTime(completed), DurationSeconds: duration, UpdatedAt: now()}
	ok, err := service.store.UpdateEvent(event)
	if err != nil {
		return model.Event{}, err
	}
	if !ok {
		return model.Event{}, ErrNotFound
	}
	return service.store.GetEvent(id)
}

func (service *Service) DeleteEvent(userID, id int64) error {
	ok, err := service.store.DeleteEvent(id, userID)
	if err != nil {
		return err
	}
	if !ok {
		return ErrNotFound
	}
	return nil
}

func (service *Service) Events(userID int64, from, to string) ([]model.Event, error) {
	return service.store.ListEvents(userID, from, to)
}

func (service *Service) Statistics(userID int64, from, to string) ([]model.StatisticPoint, []model.StatisticPoint, error) {
	fromTime, toTime, err := service.parseRange(from, to)
	if err != nil {
		return nil, nil, err
	}
	events, err := service.Events(userID, from, to)
	if err != nil {
		return nil, nil, err
	}
	daily := aggregateDaily(events, service.config.Timezone, fromTime, toTime)
	totals := make(map[string]int64)
	for _, event := range events {
		totals[event.MajorCategory] += event.DurationSeconds
	}
	byCategory := make([]model.StatisticPoint, 0, len(totals))
	for category, duration := range totals {
		byCategory = append(byCategory, model.StatisticPoint{MajorCategory: category, DurationSeconds: duration})
	}
	sort.Slice(byCategory, func(i, j int) bool { return byCategory[i].DurationSeconds > byCategory[j].DurationSeconds })
	return daily, byCategory, nil
}

func (service *Service) AdminStatistics(userIDs []int64, from, to string) ([]model.StatisticPoint, error) {
	fromTime, toTime, err := service.parseRange(from, to)
	if err != nil {
		return nil, err
	}
	users, err := service.store.ListUsers()
	if err != nil {
		return nil, err
	}
	ordinaryUsers := make(map[int64]bool)
	if len(userIDs) == 0 {
		for _, user := range users {
			if user.Role == "user" {
				userIDs = append(userIDs, user.ID)
				ordinaryUsers[user.ID] = true
			}
		}
	} else {
		for _, user := range users {
			if user.Role == "user" {
				ordinaryUsers[user.ID] = true
			}
		}
		for _, userID := range userIDs {
			if !ordinaryUsers[userID] {
				return nil, fmt.Errorf("%w：只能选择普通用户", ErrInvalid)
			}
		}
	}
	points := make([]model.StatisticPoint, 0)
	for _, userID := range userIDs {
		events, err := service.Events(userID, from, to)
		if err != nil {
			return nil, err
		}
		points = append(points, aggregateDailyWithUser(events, service.config.Timezone, fromTime, toTime)...)
	}
	sort.Slice(points, func(i, j int) bool { return pointKey(points[i]) < pointKey(points[j]) })
	return points, nil
}

func (service *Service) parseRange(from, to string) (time.Time, time.Time, error) {
	start, err := time.Parse(time.RFC3339, from)
	if err != nil {
		return time.Time{}, time.Time{}, fmt.Errorf("%w：开始日期格式无效", ErrInvalid)
	}
	end, err := time.Parse(time.RFC3339, to)
	if err != nil || !end.After(start) {
		return time.Time{}, time.Time{}, fmt.Errorf("%w：结束日期格式无效或不晚于开始日期", ErrInvalid)
	}
	if end.Sub(start) > 366*24*time.Hour {
		return time.Time{}, time.Time{}, fmt.Errorf("%w：统计范围不能超过 366 天", ErrInvalid)
	}
	return start, end, nil
}

func aggregateDaily(events []model.Event, location *time.Location, from, to time.Time) []model.StatisticPoint {
	totals := make(map[string]int64)
	categories := make(map[string]bool)
	for _, event := range events {
		started, err := time.Parse(time.RFC3339, event.StartedAt)
		if err != nil {
			continue
		}
		key := started.In(location).Format("2006-01-02") + "\x00" + event.MajorCategory
		totals[key] += event.DurationSeconds
		categories[event.MajorCategory] = true
	}
	points := make([]model.StatisticPoint, 0, len(totals))
	start := from.In(location)
	currentDate := time.Date(start.Year(), start.Month(), start.Day(), 0, 0, 0, 0, location)
	end := to.In(location)
	for currentDate.Before(end) {
		date := currentDate.Format("2006-01-02")
		for category := range categories {
			key := date + "\x00" + category
			points = append(points, model.StatisticPoint{Date: date, MajorCategory: category, DurationSeconds: totals[key]})
		}
		currentDate = currentDate.AddDate(0, 0, 1)
	}
	sort.Slice(points, func(i, j int) bool { return pointKey(points[i]) < pointKey(points[j]) })
	return points
}

func aggregateDailyWithUser(events []model.Event, location *time.Location, from, to time.Time) []model.StatisticPoint {
	points := aggregateDaily(events, location, from, to)
	for index := range points {
		if len(events) > 0 {
			points[index].UserID = events[0].UserID
			points[index].UserName = events[0].UserName
		}
	}
	return points
}

func pointKey(point model.StatisticPoint) string {
	return point.Date + "\x00" + point.UserName + "\x00" + point.MajorCategory
}

func generateToken(username, customSuffix string) (string, []byte, error) {
	suffix := customSuffix
	if suffix == "" {
		randomBytes := make([]byte, 24)
		if _, err := rand.Read(randomBytes); err != nil {
			return "", nil, fmt.Errorf("生成 token 失败：%w", err)
		}
		suffix = base64.RawURLEncoding.EncodeToString(randomBytes)
	} else {
		suffix = strings.TrimSpace(suffix)
		if len(suffix) > 64 || !tokenSuffixPattern.MatchString(suffix) {
			return "", nil, fmt.Errorf("%w：token 尾缀只能使用英文字母、数字、下划线或短横线，且不能超过 64 个字符", ErrInvalid)
		}
	}
	token := username + "-" + suffix
	return token, hashToken(token), nil
}

func hashToken(token string) []byte { digest := sha256.Sum256([]byte(token)); return digest[:] }

func (service *Service) writeAdminToken(token string) error {
	directory := filepath.Dir(service.config.AdminTokenPath)
	if err := os.MkdirAll(directory, 0700); err != nil {
		return err
	}
	temporary, err := os.CreateTemp(directory, ".admin-token-*")
	if err != nil {
		return err
	}
	temporaryPath := temporary.Name()
	defer os.Remove(temporaryPath)
	if err := temporary.Chmod(0600); err != nil {
		temporary.Close()
		return err
	}
	if _, err := temporary.WriteString(token + "\n"); err != nil {
		temporary.Close()
		return err
	}
	if err := temporary.Sync(); err != nil {
		temporary.Close()
		return err
	}
	if err := temporary.Close(); err != nil {
		return err
	}
	return os.Rename(temporaryPath, service.config.AdminTokenPath)
}

func now() string { return time.Now().UTC().Format(time.RFC3339) }
