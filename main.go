package main

import (
	"flag"
	"fmt"
	"io/fs"
	"log"
	"net"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

	"times/frontend"
	"times/internal/config"
	"times/internal/daemon"
	"times/internal/httpapi"
	"times/internal/service"
	"times/internal/store"
)

func main() {
	daemonMode := flag.Bool("d", false, "后台运行")
	stopMode := flag.Bool("stop", false, "停止后台服务")
	port := flag.String("p", "", "监听端口")
	flag.Parse()
	cfg := config.Load()
	if *port != "" {
		address, err := withPort(cfg.Address, *port)
		if err != nil {
			log.Fatal("监听端口无效：", err)
		}
		cfg.Address = address
	}
	if *stopMode {
		if err := daemon.Stop(cfg.PIDPath); err != nil {
			log.Fatal("停止后台服务失败：", err)
		}
		fmt.Println("后台服务已停止")
		return
	}
	if *daemonMode {
		pid, err := daemon.Start(os.Args[0], foregroundArgs(os.Args[1:]), cfg.LogPath, cfg.PIDPath)
		if err != nil {
			log.Fatal("启动后台服务失败：", err)
		}
		fmt.Printf("时间记录应用已在后台启动，PID：%d，日志：%s\n", pid, cfg.LogPath)
		return
	}
	run(cfg)
}

func run(cfg config.Config) {
	database, err := store.Open(cfg.DatabasePath)
	if err != nil {
		log.Fatal(err)
	}
	defer database.Close()
	application := service.New(database, cfg)
	if err := application.Initialize(); err != nil {
		log.Fatal(err)
	}
	static, err := fs.Sub(frontend.Dist, "dist")
	if err != nil {
		log.Fatal("读取前端资源失败：", err)
	}
	server := &http.Server{Addr: cfg.Address, Handler: httpapi.New(application, static).Routes(), ReadHeaderTimeout: 10 * time.Second}
	log.Printf("时间记录应用已启动，地址：%s", cfg.Address)
	log.Fatal(server.ListenAndServe())
}

func foregroundArgs(args []string) []string {
	foreground := make([]string, 0, len(args))
	for _, arg := range args {
		if arg == "-d" || strings.HasPrefix(arg, "-d=") {
			continue
		}
		foreground = append(foreground, arg)
	}
	return foreground
}

func withPort(address, port string) (string, error) {
	value, err := strconv.Atoi(port)
	if err != nil || value < 1 || value > 65535 {
		return "", fmt.Errorf("端口必须是 1 到 65535 之间的数字")
	}
	host, _, err := net.SplitHostPort(address)
	if err != nil {
		return "", fmt.Errorf("服务地址格式无效：%w", err)
	}
	return net.JoinHostPort(host, strconv.Itoa(value)), nil
}
