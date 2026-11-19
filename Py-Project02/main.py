import json
import os
import logging
from datetime import datetime
from typing import Any

from fastapi import FastAPI
from openai import OpenAI
from pydantic import BaseModel
from starlette.responses import FileResponse
from starlette.staticfiles import StaticFiles

#日志
logging.basicConfig(
    level=logging.FATAL,
    format="%(asctime)s - %(levelname)s - [%(filename)s : %(lineno)d] - %(message)s"#日志输出的格式
)




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
        9. 如果历史消息中的名字或性格与上面的设定不一致，必须以上面的设定为准，立即切换到新设定
    伴侣性格：
        - %s
    你必须严格遵守上述规则来回复用户。
"""


# 定义路径操作函数（路由函数）
@app.get("/")
def root():
    logging.info("访问项目首页")
    return FileResponse("static/index.html")  # 响应的是一个文件


# 加载伴侣预设信息
@app.get("/api/presets", summary="加载伴侣预设信息列表")
async def load_presets() -> ApiResponse:
    logging.info("加载伴侣预设信息")

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
    logging.info(f"创建会话,{request.nick_name}:{request.nature}")
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
    logging.info(f"与AI大模型交互,{request.session_name} - {request.message} - {request.nick_name} - {request.nature}")

    #加载会话文件
    session_file_name = get_session_file_name(request.session_name)
    with open(session_file_name, "r", encoding="UTF-8") as f:
        session_data = json.load(f)

    # 组装系统提示词
    system_prompt = SYSTEM_PROMPT % (request.nick_name, request.nature)
    logging.info(system_prompt)
    # 构建与AI交互的消息列表
    messages = [
        {"role": "system", "content": system_prompt},
    ]
    for msg in session_data["messages"]:
        messages.append(msg)
    messages.append({"role": "user", "content": request.message})

    logging.info(f"-----> 发送给AI大模型的消息:{messages}")

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

    logging.info(f"<----- AI大模型响应回来的消息:{ai_response}")

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


#加载历史会话列表
@app.get("/api/sessions",summary="加载历史会话列表")
async def load_sessions() -> ApiResponse:
    logging.info("加载历史会话列表")

    session_list=[]

    file_list = os.listdir(SESSION_DIR)#把文件下的文件名存进去
    for file_name in file_list:
        session_list.append(file_name[:-5])

    #按照最新的时间进行排序
    session_list.sort(reverse=True)

    return ApiResponse(code=200,message="加载历史会话列表成功", data=session_list)


#加载指定会话
@app.get("/api/sessions/{session_name}")
async def load_session(session_name:str) -> ApiResponse:
    logging.info(f"加载指定会话,{session_name}")

    #获取文件路径
    session_file_name = get_session_file_name(session_name)
    #判断文件是否存在
    if not os.path.exists(session_file_name):
        return ApiResponse(code=500,message="指定会话不存在", data=None)

    with open(session_file_name, "r", encoding="UTF-8") as f:
        session_data=json.load(f)

    return ApiResponse(code=200,message="加载指定会话成功", data=session_data)


#删除指定会话
@app.delete("/api/sessions/{session_name}")
async def delete_session(session_name:str) -> ApiResponse:
    logging.info("删除指定会话")

    session_file_name = get_session_file_name(session_name)

    #判断文件是否存在
    if not os.path.exists(session_file_name):
        return ApiResponse(code=500,message="指定会话不存在", data=None)

    #删除指定路径的文件
    os.remove(session_file_name)

    return ApiResponse(code=200,message="删除指定会话成功", data=None)

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8080)
