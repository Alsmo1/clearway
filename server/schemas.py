# server/schemas.py
"""
Pydantic models validate every request at the API boundary before it ever
reaches SQLite -- this is the same job Pydantic does at the edge of any
FastAPI service, just applied to a small local app instead of a distributed
one.
"""
from pydantic import BaseModel, Field
from typing import Optional, Literal


class HabitCreate(BaseModel):
    name: str
    color: str = "#5B7F66"
    frequency: Literal["daily", "weekly", "custom"] = "weekly"
    target_per_week: int = Field(default=7, ge=1, le=7)
    archived: int = 0


class TodoCreate(BaseModel):
    title: str
    notes: Optional[str] = None
    due_date: Optional[str] = None
    priority: Literal["low", "normal", "high"] = "normal"
    completed: int = 0
    completed_at: Optional[str] = None


class ExpenseCreate(BaseModel):
    amount: float = Field(ge=0)
    category: str = "general"
    note: Optional[str] = None
    date: str


class GoalCreate(BaseModel):
    title: str
    unit: str = ""
    target_value: float = 100
    current_value: float = 0
    deadline: Optional[str] = None


class HabitToggle(BaseModel):
    date: str


class SyncPush(BaseModel):
    changes: dict[str, list[dict]]


class AdminLogin(BaseModel):
    password: str
