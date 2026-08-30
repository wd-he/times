package config

import (
	"log"
	"os"
	"time"
)

type Config struct {
	Address        string
	DatabasePath   string
	AdminTokenPath string
	LogPath        string
	PIDPath        string
	Timezone       *time.Location
	TimezoneName   string
}

func Load() Config {
	timezoneName := envOr("TIMES_TIMEZONE", "Local")
	location, err := time.LoadLocation(timezoneName)
	if err != nil {
		log.Printf("无法加载时区 %q，改用系统时区：%v", timezoneName, err)
		location = time.Local
		timezoneName = location.String()
	}
	return Config{
		Address:        envOr("TIMES_ADDR", "127.0.0.1:8080"),
		DatabasePath:   envOr("TIMES_DB_PATH", "data/times.db"),
		AdminTokenPath: envOr("TIMES_ADMIN_TOKEN_PATH", "data/admin.token"),
		LogPath:        envOr("TIMES_LOG_PATH", "data/times.log"),
		PIDPath:        envOr("TIMES_PID_PATH", "data/times.pid"),
		Timezone:       location,
		TimezoneName:   timezoneName,
	}
}

func envOr(name, fallback string) string {
	if value := os.Getenv(name); value != "" {
		return value
	}
	return fallback
}
