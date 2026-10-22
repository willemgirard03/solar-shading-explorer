@echo off
rem Serves the working copy at http://127.0.0.1:8776 . dist\ needs no server.
cd /d "%~dp0"
start "" http://127.0.0.1:8776
node serve.mjs
