package main

import (
	"flag"
	"log"
	"net/http"
	"net/http/httputil"
	"net/url"
	"os"
	"path"
	"path/filepath"
)

var (
	listenAddr = flag.String("listen", ":8080", "dirección de escucha del servidor Go")
	backendURL = flag.String("backend", "http://localhost:4000", "URL base del backend Node.js")
)

func main() {
	flag.Parse()

	distDir, err := filepath.Abs("dist")
	if err != nil {
		log.Fatalf("no se pudo resolver el directorio dist: %v", err)
	}

	backend, err := url.Parse(*backendURL)
	if err != nil {
		log.Fatalf("backend URL inválida: %v", err)
	}
	proxy := httputil.NewSingleHostReverseProxy(proxyTarget(backend))

	static := http.FileServer(http.Dir(distDir))

	mux := http.NewServeMux()

	// /api/* -> backend Node.js
	mux.HandleFunc("/api/", func(w http.ResponseWriter, r *http.Request) {
		log.Printf("[proxy] %s %s", r.Method, r.URL.Path)
		proxy.ServeHTTP(w, r)
	})

	// Archivos estáticos (SPA), con fallback a index.html para rutas del cliente
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		clean := path.Clean(r.URL.Path)
		if clean == "/" {
			static.ServeHTTP(w, r)
			return
		}
		p := filepath.Join(distDir, filepath.FromSlash(clean))
		if info, err := os.Stat(p); err == nil && !info.IsDir() {
			static.ServeHTTP(w, r)
			return
		}
		// Fallback SPA
		http.ServeFile(w, r, filepath.Join(distDir, "index.html"))
	})

	log.Printf("Pobomopopo frontend (Go) sirviendo %s en %s", distDir, *listenAddr)
	log.Printf("Proxy /api -> %s", backend)
	log.Fatal(http.ListenAndServe(*listenAddr, mux))
}

func proxyTarget(u *url.URL) *url.URL { return u }