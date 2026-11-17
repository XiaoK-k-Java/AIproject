import json
import os
from typing import Any

from fastapi import FastAPI
from openai import APIResponse, BaseModel
from starlette.responses import FileResponse
from starlette.staticfiles import StaticFiles

#路径数据信息（常量）
PRESETS_FILE_PATH="data/companion_presets.json"

#创建FastAPI实例
app=FastAPI(title="AI智能伴侣",description="AI智能伴侣的演示案例",version="V0.1")
app.mount("/static", StaticFiles(directory="static"), name="static")

#定义统一响应的结果-封装
class ApiResponse(BaseModel):
    code: int=200
    message: str = "操作成功"
    data: Any = None

#定义路径操作函数（路由函数）
@app.get("/")
def root():
    print("访问项目首页")
    return FileResponse("static/index.html")      #响应的是一个文件

#加载伴侣预设信息
@app.get("/api/presets",summary="加载伴侣预设信息列表")
def load_presets() -> ApiResponse:
    #判读文件是否村子，如果不存在直接报错
    if not os.path.exists('static'):
        return ApiResponse(code=500,message="伴侣预设模板文件不存在",data=None)

    #读取文件
    with open(PRESETS_FILE_PATH,'r',encoding="UTF-8") as f:
        presets_list= json.load(f)

    #返回数据
    return ApiResponse(code=200,message="伴侣预设模板加载成功",data=presets_list)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
