from fastapi import FastAPI

#创建app实例
app = FastAPI()

#定义一个函数，指定路径
@app.get("/")
def root():
    print("欢迎访问我的第一个FastAPI的应用程序")
    return {"message": "Hello World"}

@app.get("/users")
def user():
    print("查询所用用户信息")
    return [{"id": 1, "name": "xk", "age": 20},{"id": 2, "name": "xxk", "age": 19}]

#运行程序
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)