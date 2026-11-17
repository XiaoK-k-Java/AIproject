import json
import os
from datetime import datetime
from typing import Any

from fastapi import FastAPI
from openai import OpenAI
from pydantic import BaseModel
from starlette.responses import FileResponse
from starlette.staticfiles import StaticFiles

# 路径数据信息（常量）
PRESETS_FILE_PATH = "data/companion_presets.json"
SESSION_DIR = "sessions"
# 检查文件是否存在，不存在自动创建
if not os.path.exists(SESSION_DIR):
    os.mkdir(SESSION_DIR)

# 创建FastAPI实例
app = FastAPI(title="AI智能伴侣", description="AI智能伴侣的演示案例", version="V0.1")
app.mount("/static", StaticFiles(directory="static"), name="static")


# 定义统一响应的结果-封装
class ApiResponse(BaseModel):
    code: int = 200
    message: str = "操作成功"
    data: Any = None


# 封装创建会话的信息
class CreateSessionModel(BaseModel):
    nick_name: str
    nature: str


# 定义AI的数据信息
class ChatRequestModel(BaseModel):
    session_name: str
    message: str
    nick_name: str
    nature: str


# 创建OpenAI客户端
client = OpenAI(
    api_key=os.environ.get('DEEPSEEK_API_KEY'),
    base_url="https://api.deepseek.com",
)
# 系统提示词
SYSTEM_PROMPT = """
    你叫 %s，现在是用户的真实伴侣，请完全代入伴侣角色。
    规则：
        1. 每次只回1条消息
        2. 禁止任何场景或状态描述性文字
        3. 匹配用户的语言
        4. 回复简短，像微信聊天一样
        5. 有需要的话可以用❤️🌸等emoji表情
        6. 用符合伴侣性格的方式对话
        7. 回复的内容, 要充分体现伴侣的性格特征
        8. 不要太肉麻（比如想你之类的，就日常聊天）
    伴侣性格：
        - %s
    你必须严格遵守上述规则来回复用户。
"""


# 定义路径操作函数（路由函数）
@app.get("/")
def root():
    print("访问项目首页")
    return FileResponse("static/index.html")  # 响应的是一个文件


# 加载伴侣预设信息
@app.get("/api/presets", summary="加载伴侣预设信息列表")
async def load_presets() -> ApiResponse:
    # 判读文件是否村子，如果不存在直接报错
    if not os.path.exists('static'):
        return ApiResponse(code=500, message="伴侣预设模板文件不存在", data=None)

    # 读取文件
    with open(PRESETS_FILE_PATH, 'r', encoding="UTF-8") as f:
        presets_list = json.load(f)

    # 返回数据
    return ApiResponse(code=200, message="伴侣预设模板加载成功", data=presets_list)


# 声明函数
# 生成会话名称
def generate_session_name():
    return datetime.now().strftime("%Y-%m-%d_%H-%M-%S")


# 获取会话文件名
def get_session_file_name(session_name):
    return SESSION_DIR + "/" + session_name + ".json"


# 创建会话
@app.post("/api/sessions", summary="创建会话")
async def create_sessinon(request: CreateSessionModel) -> ApiResponse:
    print(f"创建会话,{request.nick_name}:{request.nature}")
    # 生成会话名称-->当前时间
    session_name = generate_session_name()

    # 将该会话的数据信息保存到文件中
    session_data = {
        "session_name": session_name,
        "nick_name": request.nick_name,
        "nature": request.nature,
        "messages": []
    }

    with open(get_session_file_name(session_name), "w", encoding="UTF-8") as f:
        json.dump(session_data, f, ensure_ascii=False, indent=4)

    return ApiResponse(code=200, message="创建会话成功", data=session_name)


# 与AI大模型交互
@app.post("/api/chat", summary="与AI大模型交互")
async def chat(request: ChatRequestModel) -> ApiResponse:
    print(f"与AI大模型交互,{request.session_name} - {request.message} - {request.nick_name} - {request.nature}")

    #加载会话文件
    session_file_name = get_session_file_name(request.session_name)
    with open(session_file_name, "r", encoding="UTF-8") as f:
        session_data = json.load(f)

    # 组装系统提示词
    system_prompt = SYSTEM_PROMPT % (request.nick_name, request.nature)
    print(system_prompt)
    # 构建与AI交互的消息列表
    messages = [
        {"role": "system", "content": system_prompt},
    ]
    for msg in session_data["messages"]:
        messages.append(msg)
    messages.append({"role": "user", "content": request.message})

    print(f"-----> 发送给AI大模型的消息:{messages}")

    # 调用AI大模型-deepseek
    response = client.chat.completions.create(
        model="deepseek-flash",
        messages=messages,
        stream=False,
        reasoning_effort="high",
        extra_body={"thinking": {"type": "disabled"}},
    )

    # 获取AI大模型响应的结果
    ai_response = response.choices[0].message.content

    print(f"<----- AI大模型响应回来的消息:{ai_response}")

    #更新消息列表
    messages.pop(0)   #删除列表中的第一条消息---系统提示词
    messages.append({"role": "assistant", "content": ai_response})
    session_data["messages"] = messages
    session_data["nick_name"] = request.nick_name
    session_data["nature"] = request.nature

    #将更新后的消息列表保存到文件中
    with open(session_file_name, "w", encoding="UTF-8") as f:
        json.dump(session_data, f, ensure_ascii=False, indent=2)

    return ApiResponse(code=200, message="操作成功", data=ai_response)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8080)
