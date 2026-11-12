# 员工类 --> 抽象类
from abc import ABC, abstractmethod


class Employee(ABC):
    def __init__(self, emp_id, name, base_salary=5000):
        self.emp_id = emp_id
        self.name = name
        self.base_salary = base_salary

    # 计算奖金这里逻辑是不确定, 这里是需要交给子类来实现的, 不同子类有不同的实现
    @abstractmethod
    def calculate_bonus(self) -> float:     # 计算奖金
        pass

    def total_salary(self):     # 计算总工资
        return self.base_salary + self.calculate_bonus()

    def show_info(self):        # 展示员工信息
        print(f"工号：{self.emp_id} | 姓名：{self.name} | 基本工资：{self.base_salary} | 奖金：{self.calculate_bonus()} | 总工资：{self.total_salary()}")

# 销售员
class Salesman(Employee):
    def __init__(self, emp_id, name, sales_amount, base_salary=5000):
        super().__init__(emp_id, name, base_salary)
        self.sales_amount = sales_amount        # 销售金额

    def calculate_bonus(self) -> float:         # 计算奖金
        return self.sales_amount * 0.05


# 经理
class Manager(Employee):
    def calculate_bonus(self) -> float:  # 计算奖金
        return 3000.0


# 程序员
class Programmer(Employee):
    def __init__(self, emp_id, name, projects_completed, base_salary=5000):
        super().__init__(emp_id, name, base_salary)
        self.projects_completed = projects_completed        # 项目完成数

    def calculate_bonus(self) -> float:         # 计算奖金
        return self.projects_completed * 500


if __name__ == "__main__":
    employees = [
        Salesman("S001", "张三", 5000),
        Manager("M001", "李四"),
        Programmer("P001", "王五", 3)
    ]

    print("=" * 70)
    print("员工工资表")
    print("=" * 70)
    for emp in employees:
        emp.show_info()
    print("=" * 70)