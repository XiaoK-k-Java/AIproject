from fastapi import FastAPI
from starlette.responses import FileResponse
from starlette.staticfiles import StaticFiles

#创建FastAPI实例
app=FastAPI(title="AI智能伴侣",description="AI智能伴侣的演示案例",version="V0.1")
app.mount("/static", StaticFiles(directory="static"), name="static")

#定义路径操作函数（路由函数）
@app.get("/")
def root():
    print("访问项目首页")
    return FileResponse("static/index.html")      #响应的是一个文件




if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
