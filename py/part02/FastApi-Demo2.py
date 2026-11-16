from fastapi import FastAPI
from openai import BaseModel

#创建app实例
app = FastAPI()

#User类，Pydantic模型
class User(BaseModel):
    id: int
    name: str
    age: int

#定义一个函数，指定路径,summary做标注，response_model响应回来的格式
@app.get("/",summary="首页")
def root():
    print("欢迎访问我的第一个FastAPI的应用程序")
    return {"message": "Hello World"}

@app.get("/users",summary="查询所有用户信息",response_model=list[User])
def user():
    print("查询所用用户信息")
    return [User(id=1,name="xk",age=20),User(id=2,name="xxk",age=19)]

#运行程序
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)