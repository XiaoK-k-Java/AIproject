from datetime import datetime
from operator import or_

from sqlalchemy import create_engine,Integer,String,DateTime
from sqlalchemy.orm import declarative_base, mapped_column, Mapped, sessionmaker

#创建SQLAlchemy引擎，管理数据库连接
engine = create_engine("mysql+pymysql://root:1006@localhost:3306/db02",echo=True)


#声明模型父类，定义与数据库表映射的模型类
Base = declarative_base()
class AiMessage(Base):
    __tablename__ = "ai_message"

    id:Mapped[int] = mapped_column(Integer,primary_key=True,comment="主键",autoincrement=True)
    session_id: Mapped[int] = mapped_column(Integer, nullable=False)
    role: Mapped[str] = mapped_column(String(20), nullable=False)
    content: Mapped[str] = mapped_column(String(500), nullable=False)
    create_time: Mapped[datetime] = mapped_column(DateTime, nullable=False)


    def __repr__(self):
        return f"<AiMessage(id={self.id}, session_id={self.session_id}, role={self.role}, content={self.content}, create_time={self.create_time})>"

#创建对话,
sessionFactory=sessionmaker(bind=engine)



#运行程序
if __name__ == '__main__':
    # #获取会话
    session = sessionFactory()
    #
    # #执行操作--添加，基于 session会话对象进行操作
    # session.add(AiMessage(session_id=1,role="assistant",content="不怎么好",create_time=datetime.now()))
    #
    # #提交事务
    # session.commit()
    #
    # session.query(AiMessage).filter(AiMessage.id==8).update({"content":"还好呀"})
    # session.commit()

    # session.query(AiMessage).filter(AiMessage.id.in_([9,10])).delete()
    # session.commit()

    # session.query(AiMessage).filter(AiMessage.id == 8).update({"content": "还好呀","role":"assistant"})
    # session.commit()


    #查询所有数据的所有字段
    # message_list = session.query(AiMessage).all()
    # for message in message_list:
    #     print(message)


    #查询所有数据的指定字段（如果查询返回的是部分字段，查询的每一条数据都封装再Row）
    # message_list = session.query(AiMessage.role,AiMessage.content).all()
    # for message in message_list:
    #     print(f"{message[0]}========={message[1]}")


    #查询id为8的数据
    # message = session.query(AiMessage).filter(AiMessage.id == 8).one()
    # print(message)

    #查询 session_id=1，并且role=user的数据
    # message_list = session.query(AiMessage).filter(AiMessage.session_id == 1,AiMessage.role=="user").all()
    # for message in message_list:
    #     print(message)

    #查询id为8，或者role=user的消息
    # message = session.query(AiMessage).filter(or_(AiMessage.id==8,AiMessage.role=="user")).all()
    # for mes in message:
    #     print(mes)


    #id为8，或者role=“user”的消息，并根据创建时间进行倒序排序，创建时间相同，根据id升序排序
    # message_list = session.query(AiMessage).filter(or_(AiMessage.id == 8, AiMessage.role == "user")).order_by(AiMessage.create_time.desc(), AiMessage.id.asc()).all()
    # for message in message_list:
    #     print(message)


    #查询id为8，或者role=“user”的消息，返回第一页的数据，每页展示五条数据
    # message_list = session.query(AiMessage).filter(or_(AiMessage.id == 8, AiMessage.role == "user")).offset(0).limit(5).all()
    # for message in message_list:
    #     print(message)
